# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## Project

**Grammar Check** is a privacy-first, AI-powered grammar and spelling checker browser extension (Chrome MV3 + Firefox MV2). It underlines issues in text fields on any site and calls an AI provider **directly from the user's browser**: local models via any OpenAI-compatible endpoint (Ollama, Open WebUI, LM Studio), Google Gemini, OpenAI, Anthropic Claude, or Hugging Face (Inference Providers router, OpenAI-compatible). There is no backend server, no account, and no telemetry. That is the product's core promise, so every change must preserve it.

- License: MIT. Repo: `github.com/Mangesh-P/grammer-check`
- Gecko ID: `grammar-check@mangesh-p.github.io`
- User-facing docs live in `README.md`. Keep it in sync when behaviour, settings, permissions, or defaults change.

## Commands

```bash
npm ci                   # install (postinstall runs `wxt prepare`, which generates .wxt/)
npm run dev              # Chrome with hot reload (dev server on port 3210)
npm run dev:firefox      # Firefox with hot reload
npm run build            # -> .output/chrome-mv3
npm run build:firefox    # -> .output/firefox-mv2
npm run zip / zip:firefox
npx tsc --noEmit         # type-check (CI runs this)
npm run lint             # Biome lint (CI runs this); npm run lint:fix applies safe fixes
npm test                 # Vitest (CI runs this); npm run test:watch / test:coverage
```

Linting is [Biome](https://biomejs.dev) (`biome.json`, recommended rules, formatter off). **Before calling any change done, run `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build`** (and `npm run build:firefox` if you touched the manifest, background, or browser APIs). These match CI.

Requires Node 22+.

## Tech stack

- **WXT 0.21** (`srcDir: 'src'`, `@wxt-dev/module-react`). `browser`, `defineBackground`, `defineContentScript` are WXT auto-imports; don't import them.
- **React 19** + **Tailwind CSS v4** (via `@tailwindcss/postcss`; `src/styles.css` is just `@import "tailwindcss"`) for the popup and options pages.
- **Vercel AI SDK v7** (`ai`, `@ai-sdk/google|openai|anthropic|openai-compatible`). Uses `generateText({ model, instructions, messages, temperature })`.
- **TypeScript** strict mode, `moduleResolution: bundler`, path alias `@/*` → `src/*`.
- `lucide-react` for icons, `zod` available for validation.

## Architecture

```text
src/
├── entrypoints/
│   ├── background.ts      # Single message router: AI calls, cache, dictionary filter, stats, keyboard command
│   ├── content.ts         # Field detection (MutationObserver), Shadow-DOM overlay, underlines, popovers, panel
│   ├── popup/             # Toolbar popup (React): on/off, mode, stats
│   └── options/           # Options page (React): tabs/ApiKeysTab, SettingsTab, DictionaryTab
├── components/ui/         # Our own React primitives, `Gra`-prefixed (GraSelect, GraToggle, GraSpinner, GraStatsGrid) to tell them apart from third-party ones like shadcn
├── lib/
│   ├── ai/
│   │   ├── grammar-check.ts   # checkGrammar / rewriteText + response parsing and index recovery
│   │   ├── providers.ts       # createAIProvider / getModel per provider
│   │   ├── base-url.ts        # validateBaseURL (https-only except localhost)
│   │   ├── prompts.ts         # User-prompt builders; imports system prompts via `?raw`
│   │   └── prompts/*.md       # System prompts (grammar, rewrite, proofread, translate)
│   ├── hooks/useStoredValue.ts  # useStoredValue / useSettings: storage-synced React state
│   ├── selection.ts       # Rewrite menu: read/replace the selection in a textarea or contenteditable (execCommand first, for undo)
│   ├── storage.ts         # Typed storage items + helpers (keys, settings, dictionary, stats, cache)
│   └── utils.ts           # debounce, isEditableElement / sensitive-field detection, DOM text helpers
└── types/index.ts         # Shared types, DEFAULT_SETTINGS, PROVIDER_META, AVAILABLE_MODELS, languages
```

### Data flow

1. `content.ts` detects editable fields, debounces input (`settings.realtimeDelay`), and sends `CHECK_GRAMMAR` to the background.
2. `background.ts` checks the cache, loads settings + API key, calls `checkGrammar`, drops spelling hits that are in the personal dictionary, caches, and updates stats.
3. `content.ts` discards stale responses (compares against `lastRequestedText`) and renders underlines inside a Shadow DOM overlay.
4. Rewrite menu: selecting 3+ words in a checked field shows a ✨ button → Formalize / Friendly / Shorten / Proofread / Translate › language → `REWRITE_TEXT` (`style`, plus `targetLanguage` for translate, validated against `TRANSLATE_LANGUAGES`) → preview card → **Replace** swaps only the selection (`replaceFieldSelection`). `getRewriteSystemPrompt` picks the system prompt per style. Nothing is sent until an item is picked; gated by `settings.rewriteMenu`; the last translate target is saved as `settings.translateTo`.
5. Keyboard command `check-grammar` (Ctrl/Cmd+Shift+G) → background → `TRIGGER_CHECK` to the active tab.

Messages handled by the background: `CHECK_GRAMMAR`, `REWRITE_TEXT`, `GET_SETTINGS`, `ADD_TO_DICTIONARY`, `CORRECTION_APPLIED`. Responses are always `{ success: true, ... }` or `{ success: false, error }`.

## Non-negotiable rules (privacy and security)

These are the decisions already made in this codebase. Don't regress them.

1. **API keys stay in `browser.storage.local`** (`apiKeysStorage`). Never move them to `sync`, never log them, never send them anywhere except the selected provider. Settings, dictionary and stats use `sync`; the results cache uses `local`.
2. **Custom base URLs go through `validateBaseURL`**: `https://` only, plain `http://` only for `localhost`, `127.0.0.1`, `[::1]`, and no embedded credentials. Any new endpoint setting must use the same validation.
3. **Never read sensitive fields.** `isEditableElement` in `src/lib/utils.ts` skips password/email/tel/url/number inputs, payment/OTP/login/address autocomplete tokens, name/id hints, and opt-outs (`spellcheck="false"`, `data-gramm="false"`, `data-enable-grammarly="false"`). The one exception is `spellcheck="false"` on Gmail's compose body (`g_editable="true"`), which Gmail sets for its own spellchecker. New field types must pass through this check; err on the side of skipping.
4. **Validate message senders.** The background listener rejects anything where `sender.id !== browser.runtime.id`. Keep it.
5. **Escape all model output before inserting HTML.** In the content script, every piece of AI text (`original`, `replacement`, `explanation`) goes through `escapeHtml` before `innerHTML`. Prefer `textContent` for new code.
6. **No new third-party network calls, analytics, or remote scripts.** Only the user-configured AI endpoint.
7. **Permissions are minimal**: `storage`, `activeTab`, `<all_urls>` host permissions. Adding a permission requires a strong reason and a README "Permissions explained" update.
8. Cache limits: max 100 entries (evict oldest 20), 1-hour TTL. Text is keyed by a hash, so changing the hash invalidates old entries (acceptable).

## Tests

- Vitest + happy-dom + Testing Library, in `tests/` (mirrors `src/`). `tests/setup.ts` provides `browser` (WXT's in-memory `fakeBrowser`, reset before each test), `defineBackground` and `defineContentScript`. Don't switch to `wxt/testing`'s `WxtVitest` plugin: its auto-import transform breaks coverage source maps.
- The AI SDK is never called: mock `generateText` (`ai`) or `@/lib/ai/grammar-check`. No network in tests.
- `content.test.ts` runs the real content script `main()` with a fake `ctx`, fake timers and mocked layout rects (happy-dom has no layout), then drives it through DOM events. New fields are picked up on the next animation frame, which restarts the real-time debounce (`addField` waits for it).
- Add tests with every behaviour change; keep the privacy rules (sensitive fields skipped, sender validation, escaped model output, translate-language allowlist) covered.

## Coding conventions

### Storage

- Use the `createStorageItem` pattern in `storage.ts`. Object values are **merged over defaults** (`withDefaults`), so adding a field to `Settings` only needs a default in `DEFAULT_SETTINGS`. No migration required.
- **Write settings with `updateSettings(patch)`**, which merges a patch into the latest stored value, not by writing a whole object held in UI state. The popup and options page can be open at the same time and must not clobber each other.
- An empty API key **removes** the provider entry (`setApiKey`) instead of storing `''`.

### React (popup and options)

- Read storage with `useStoredValue(item)` / `useSettings()`. They subscribe before reading (so no missed updates), stay in sync across extension contexts, and `useSettings().update` is optimistic with rollback on failure.
- Options page writes go through `useSaveStatus().track(promise)` so the "Saving… / Saved / Error" toast is correct for overlapping saves.
- Reuse `components/ui/*` and the class constants in `options/styles.ts` (`inputClass`, `labelClass`, `hintClass`, `sectionHeadingClass`) instead of re-writing Tailwind strings.
- Accessibility: proper roles/ARIA (see `GraToggle`: `role="switch"`, `aria-checked`, `aria-label`), visible `focus-visible` outlines, `aria-invalid` for field errors.
- Support dark mode with `dark:` variants (zinc palette, indigo accent).
- Clear timers and listeners in effect cleanups.

### Content script

- All injected UI lives inside a **Shadow DOM** overlay with max `z-index` so host-page CSS can't break it and our CSS can't leak.
- Batch DOM work (MutationObserver + `requestAnimationFrame`), track processed elements in a `WeakSet`.
- Use WXT's `ctx` for lifecycle (`ctx.onInvalidated` cleanup) so a reloaded extension doesn't leave orphaned listeners or overlays.
- Drop out-of-date async results instead of rendering them (see `lastRequestedText`).
- Injected buttons use `data-action="${ACTION.X}"` and handlers compare against `ACTION.X` (top of `content.ts`); don't hand-write action strings.
- After changing a field's value, dispatch a bubbling `input` event so React/Vue/etc. pages notice (`setTextInElement`).
- `content.ts` is large (~1500 lines). When adding substantial features, extract pure helpers into `src/lib/` rather than growing it further.

### AI layer

- System prompts are **Markdown files** in `src/lib/ai/prompts/`, imported with `?raw`. Edit prompts there, not inline in TS.
- The grammar prompt asks the model for `original`/`replacement`/`explanation`/`type` JSON. `checkGrammar` extracts the first `{…}` block, keeps a suggestion only if `original` exists in the text, and **recovers indices with `indexOf`** when the model's offsets are wrong or missing. Small local models produce sloppy JSON, so parsing must stay defensive and never crash the check.
- Grammar and proofread use `temperature: 0.1`; rewrite and translate use `0.7`. Current cloud models are reasoning models, so native providers also get `reasoning: 'none'` (`getReasoning` in `providers.ts`). This keeps checks fast, and the SDK drops `temperature` with a warning on models that reject it. OpenAI-compatible endpoints get no `reasoning`, because it would be sent as a raw `reasoning_effort`.
- OpenAI with a custom `baseURL` uses `createOpenAICompatible(...).chatModel(id)`. This is how local models work. Without a base URL it uses `createOpenAI`. Hugging Face also uses `createOpenAICompatible` with the fixed `https://router.huggingface.co/v1` base URL.
- `settings.model === 'custom'` means use `settings.customModel`.
- Recommended local model: `qwen3:8b` (`phi4-mini` and `gemma3:4b` tested poorly). Model lists live in `AVAILABLE_MODELS` in `src/types/index.ts`.

### General

- Use named constants for repeated domain values and configurable limits; keep simple literals inline when a name adds no clarity. Use `interface` for object shapes and `type` for unions and derived types.
- TypeScript strict; use `import type` for type-only imports and the `@/` alias for cross-folder imports.
- Shared types and constants go in `src/types/index.ts`; don't duplicate provider metadata or defaults elsewhere.
- Comments explain **why** (see existing ones in `storage.ts`, `useSaveStatus.ts`), not what.
- Errors: catch at the boundary (background `handleMessage`), log with `console.error`, and return a user-readable `error` string. Don't swallow errors silently.
- Match the surrounding file's style (single quotes in `src/lib` and React files; the content script uses double quotes). Fix mis-indented blocks you touch (e.g. the `generateText` calls in `grammar-check.ts`, the `checkGrammar` call in `background.ts`).

### Build config gotchas

- **Don't add `@vitejs/plugin-react` to `wxt.config.ts`**. `@wxt-dev/module-react` already adds it, and adding it again breaks dev mode.
- Keep `optimizeDeps.include` in `wxt.config.ts` up to date when adding heavy UI deps, so Vite doesn't re-optimize and force-reload pages mid-session.
- `webExt.disabled: true`: dev mode doesn't auto-launch a browser; load `.output/chrome-mv3` (or firefox) manually.
- The manifest version in `wxt.config.ts` and `package.json` should be bumped together.

## CI / release

- `.github/workflows/ci.yml`: on push/PR to `main`, runs `npm ci` → `biome lint` → `tsc --noEmit` → Chrome build → Firefox build, uploads both as artifacts.
- `.github/workflows/release.yml`: on tag `X.Y.Z` / `vX.Y.Z`, builds both browsers, zips them as `grammar-check-{chrome,firefox}-<tag>.zip`, and creates a GitHub Release with a changelog from commit subjects. So **write meaningful commit subjects**.
- `.gitignore` excludes `.output/`, `.wxt/`, zips/crx/xpi/pem/keys, `.env*`, and `.claude/settings.local.json`. Never commit build output or signing keys.

## Workflow for changes

1. Read the relevant files first and follow existing patterns (storage items, hooks, message types).
2. Keep diffs focused. Don't refactor unrelated code in the same change.
3. If you add a setting: add it to `Settings` + `DEFAULT_SETTINGS`, expose it in `SettingsTab`, read it via `settingsStorage`, and document it in README's "Configuration reference".
4. If you add a message type: handle it in `background.ts` `handleMessage`, keep the `{ success, error }` response shape, and add it to `MESSAGE_TYPE` in `src/types/index.ts`. Refer to messages by `MESSAGE_TYPE.*` on both sides, never by string literals.
5. If you add a provider: add it to `AI_PROVIDER` (this updates `AIProvider` and `APIKeys`), then extend `PROVIDER_META`, `AVAILABLE_MODELS`, `createAIProvider`, and the README. Refer to providers by `AI_PROVIDER.*`, never by string literals.
6. Verify with `npm run lint` + `npx tsc --noEmit` + `npm test` + `npm run build` (+ Firefox build when relevant), then manually load the unpacked build and exercise the change on a real page (textarea, contenteditable, and a sensitive field that must be skipped).
7. Update `README.md` for any user-visible change.

## Known gaps / tech debt

- Biome runs as a linter only; its formatter is off because formatting is inconsistent (quote style differs between `src/lib` and `content.ts`), and enabling it would reformat most files. 26 `noNonNullAssertion` warnings remain.
- Duplication to clean up: `escapeHtml` is defined both in `lib/utils.ts` and inside `content.ts`. `ADD_TO_DICTIONARY` in the background re-implements `addToDictionary` from `storage.ts`.
- Message payloads are untyped: `handleMessage` casts `message.payload` with `as` per case. A discriminated union keyed on `MESSAGE_TYPE` would let TypeScript check them.
- Grammar responses are validated with zod: native providers use `Output.object` (falling back to `parseGrammarResponse` on `NoObjectGeneratedError`), OpenAI-compatible endpoints use plain text + lenient per-suggestion `safeParse`. Rewrite parsing (`parseRewriteResponse`) is still hand-rolled.
- Google Docs support is experimental.
- The project directory is not yet a git repository.
