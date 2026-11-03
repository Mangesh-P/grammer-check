---
name: api-key-security-audit
description: Security audit for the Grammar Check extension, focused on keeping user API keys (Gemini, OpenAI, Anthropic, Hugging Face) from leaking. Use whenever the user asks for a security check, security review, secret scan, or "are the API keys safe", and before any release, PR, or commit that touches storage.ts, background.ts, providers.ts, base-url.ts, the content script, wxt.config.ts, permissions, or dependencies. Also use proactively after adding a provider, a setting, a message type, or any network call, even if the user does not say "security".
---

# API key security audit

The product promise is that keys never leave the user's browser except to the provider they chose. A single regression (a key in `sync` storage, a `console.log`, an unvalidated base URL) breaks that promise, so run this audit rather than trusting memory of the rules.

## Workflow

1. Run the deterministic scanner from the repo root:
   ```bash
   bash .claude/skills/api-key-security-audit/scripts/scan.sh
   ```
   It exits non-zero if any check fails. Each failure prints file:line evidence.
2. For each failure, read the code and decide: real leak or false positive? Fix real ones with minimal diffs. Explain false positives to the user rather than silently ignoring them. Don't weaken the scanner to make it pass.
3. Do the manual review below on the diff (`git diff main...HEAD` or `git diff`). The scanner finds patterns; it can't judge data flow.
4. Report: what passed, what failed, what you fixed, what needs a human decision. Be plain about checks you could not run (for example `npm audit` offline).

## Manual review (what grep cannot see)

Trace every place an API key value flows. It may only go: `apiKeysStorage` (`browser.storage.local`) → background → `createAIProvider` → the selected provider's SDK.

- **Content script must never receive a key.** Messages to content scripts and `GET_SETTINGS` responses must not include `apiKeys`. Check response objects built in `background.ts`.
- **Errors**: provider errors can echo request headers or URLs. Make sure error strings returned to the page or logged don't include keys, `Authorization` headers, or full request bodies.
- **Base URL**: a custom endpoint receives the key, so a wrong URL means key theft. Any new endpoint setting must go through `validateBaseURL` (https only, http only for localhost/127.0.0.1/[::1], no embedded credentials). Check that the key is sent only to the URL of the *selected* provider, never to a different one after switching.
- **Options/popup UI**: key inputs should be `type="password"`, use `autocomplete="off"`, and not be written into the DOM as text, URLs, or `data-*` attributes. Don't put keys in `localStorage`, `sessionStorage`, or the cache.
- **Cache**: cached entries are keyed by text hash. They must not contain keys or request metadata.
- **Sensitive fields**: new field types must pass `isEditableElement` so user text from password/payment/OTP fields is never sent to a provider.
- **Message senders**: the background listener must keep rejecting `sender.id !== browser.runtime.id`.
- **Model output**: AI text must go through `escapeHtml` or `textContent` before it reaches the DOM (XSS in the content script would run in the host page and could try to message the extension).
- **Supply chain**: new dependencies or install scripts, and new permissions (README "Permissions explained" must be updated). No remote scripts, analytics, or new third-party network calls.
- **Repo hygiene**: no `.env`, keys, `.pem`, or build output committed; CI secrets (`CWS_*`) only referenced via `secrets.*`, never echoed.

## If a key may already have leaked

Tell the user to revoke and rotate it at the provider immediately. Removing it from git history is not enough, because it may already be cached or cloned.

## Output format

```
## Security audit
Scanner: PASS / FAIL (n checks failed)
Findings:
- [severity] file:line, what, why it matters, fix
Manual review: <areas checked, anything unclear>
Not run: <anything skipped and why>
```
