# Privacy Policy

**Grammar Check - AI Grammar & Spelling Checker**
Last updated: 2026-10-13

Grammar Check is a browser extension that checks grammar and spelling in text fields. It has no backend server, no user accounts, and no analytics. The developer does not collect, receive, store, or sell any of your data.

## What data the extension handles

| Data | Where it goes | Why |
|---|---|---|
| **Text you type in a text field** | Sent **only** to the AI provider you configure (for example a local Ollama / Open WebUI / LM Studio server, Google Gemini, OpenAI, Anthropic, or Hugging Face). Sent only when a grammar check runs or when you pick a rewrite action. | To find grammar and spelling issues or rewrite the text you selected. |
| **API keys** | Stored in the browser's local extension storage on your device. Never synced, never sent anywhere except the provider they belong to. | To authenticate with the provider you chose. |
| **Settings, personal dictionary, usage statistics** | Stored in the browser's extension storage and synced through your browser account (Chrome Sync / Firefox Sync) if you have sync turned on. | So your preferences follow you between devices. |
| **Recent check results** | Cached in local extension storage on your device (at most 100 entries, reused for at most one hour). | To avoid sending the same text twice. |

If you use a local model, your text never leaves your machine.

## What the extension does not do

- It does not read password, email, phone, URL, number, payment, one-time-code, login, or address fields, or fields that opt out with `spellcheck="false"` or `data-gramm="false"`.
- It does not read page content outside the field you are typing in, your browsing history, or cookies.
- It does not use analytics, telemetry, advertising, or third-party scripts.
- It does not send any data to the developer.

## Third-party AI providers

When you configure a cloud provider, the text being checked is processed by that provider under its own privacy policy. Review the policy of the provider you choose:

- Google Gemini: https://policies.google.com/privacy
- OpenAI: https://openai.com/policies/privacy-policy
- Anthropic: https://www.anthropic.com/legal/privacy
- Hugging Face: https://huggingface.co/privacy

## Removing your data

Uninstalling the extension deletes everything it stored locally. To remove an API key without uninstalling, clear it on the extension's options page.

## Contact

Questions or concerns: open an issue at https://github.com/Mangesh-P/grammer-check/issues

Changes to this policy will be published in this file in the repository.
