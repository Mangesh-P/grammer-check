# Store listing text

Copy-paste text for the Chrome Web Store, Firefox Add-ons (AMO), and Edge Add-ons forms. Keep it in sync with `README.md` and `PRIVACY.md` when features, permissions, or data handling change.

Privacy policy URL (all stores):
`https://github.com/Mangesh-P/grammer-check/blob/main/PRIVACY.md`

## Name

Grammar Check - AI Grammar & Spelling Checker

## Short description / summary (max 132 chars)

Privacy-first AI grammar, spelling, and style checker. Works with local models (Ollama, Open WebUI) or your own API key.

## Detailed description

Grammar Check underlines grammar, spelling, and style issues in text fields on any website, using the AI model you choose. There is no account, no server in between, and no tracking: your browser talks directly to your AI provider.

USE A LOCAL MODEL OR YOUR OWN KEY
• Local models through any OpenAI-compatible endpoint: Ollama, Open WebUI, LM Studio. Your text never leaves your machine.
• Or bring your own API key for Google Gemini, OpenAI, Anthropic Claude, or Hugging Face.

FEATURES
• Real-time underlines in text areas, rich-text editors, and text inputs
• One-click fixes with a short explanation for every suggestion
• Rewrite menu: select text to Formalize, make Friendly, Shorten, Proofread, or Translate it
• Personal dictionary for names and jargon
• Keyboard shortcut: Ctrl+Shift+G (Cmd+Shift+G on Mac)
• Dark mode

PRIVACY FIRST
• Text is sent only to the AI provider you configure, and only when a check or rewrite runs
• API keys are stored locally on your device and never synced
• Password, email, payment, login, and other sensitive fields are skipped automatically
• No analytics, telemetry, or third-party scripts

Open source (MIT): https://github.com/Mangesh-P/grammer-check

## Category

- Chrome: Productivity → Tools (or "Workflow & Planning")
- Firefox: Language Support (Other: Productivity)
- Edge: Productivity

## Chrome Web Store: Privacy practices tab

**Single purpose**

Grammar Check checks and improves grammar, spelling, and style of text the user types into text fields on web pages, using an AI model the user configures.

**Permission justifications**

- `storage`: Saves the user's settings, personal dictionary, usage statistics, a short-lived cache of check results, and the user's AI provider API keys (keys are kept in local storage only, never synced).
- `activeTab`: Lets the keyboard shortcut (Ctrl+Shift+G) trigger a grammar check in the text field on the current tab.
- Host permission `<all_urls>`: The extension's purpose is to check text fields on any site the user writes on, so the content script must run on all pages. It is also needed to send requests to the AI endpoint the user configures, which can be any cloud provider or a self-hosted/local server (for example `http://localhost:11434`). The content script only reads the text of the editable field the user is typing in, and skips sensitive fields (passwords, payment, login, etc.).

**Remote code**

No, I am not using remote code. All JavaScript is bundled in the package. The extension only makes API (data) requests to the user-configured AI provider.

**Data usage: what is collected**

Tick only **Website content**. (Typed text is sent to the AI provider the user selects, to provide the grammar check. The developer receives nothing.)

Leave everything else unticked: personally identifiable info, health, financial, authentication info, personal communications, location, web history, user activity.

**Certifications**: tick all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

## Firefox AMO: source code submission notes

Paste into "Notes to reviewer" when uploading `grammar-check-<version>-sources.zip`:

```text
The extension is built with WXT (Vite) + React + TypeScript; the submitted package is bundled.
Build requirements: Node.js 22+, npm 10+. Any OS (tested on Windows).

Steps:
  npm ci
  npm run build:firefox

Output: .output/firefox-mv2/ (identical to the uploaded package).

The extension has no backend. Network requests go only to the AI endpoint the user configures
in the options page (Gemini, OpenAI, Anthropic, Hugging Face, or a local/self-hosted
OpenAI-compatible server). data_collection_permissions declares "websiteContent" because the text
being checked is sent to that provider.

To test without an API key: run Ollama locally (ollama pull qwen3:8b), then in Options choose
OpenAI with base URL http://localhost:11434/v1 and model qwen3:8b.
```

## Assets checklist

| Asset | Chrome | Firefox | Edge |
|---|---|---|---|
| Icon | 128×128 PNG | from the package | 300×300 PNG |
| Screenshots | 1–5, 1280×800 or 640×400 | 1+, any size (1280×800 recommended) | 1–6, 1280×800 or 640×480 |
| Small promo tile | 440×280 (required) | – | 440×280 (optional) |
| Marquee | 1400×560 (optional) | – | 1400×560 (optional) |

Existing screenshots in `assets/` (`popup.png`, `setting.png`, `apikey.png`) need to be padded or resized to 1280×800. Add at least one showing underlines and the suggestion popover on a real page; that's what reviewers and users look for.
