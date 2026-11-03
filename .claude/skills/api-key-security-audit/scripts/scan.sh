#!/usr/bin/env bash
# Deterministic security checks for Grammar Check. Run from the repo root.
# Exits 1 if any check fails. Patterns are intentionally conservative: a hit
# means "a human must look", not "definitely a leak".
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

FAILS=0
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.output --exclude-dir=.wxt --exclude-dir=.git --exclude=package-lock.json)

fail() { echo "FAIL: $1"; FAILS=$((FAILS + 1)); }
pass() { echo "PASS: $1"; }

# Prints matching lines; returns 0 if there were any.
hits() { grep -rnIE "${EXCLUDES[@]}" "$@" 2>/dev/null; }

# 1. Hardcoded credentials (provider key formats, private keys, tokens).
KEY_RE='(sk-ant-[A-Za-z0-9_-]{20,}|sk-(proj-)?[A-Za-z0-9_-]{32,}|AIza[0-9A-Za-z_-]{35}|hf_[A-Za-z0-9]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
OUT=$(hits "$KEY_RE" src tests public docs README.md wxt.config.ts package.json .github CLAUDE.md PRIVACY.md || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "possible hardcoded API key or private key"; else pass "no hardcoded keys in source/docs/workflows"; fi

# 2. Tracked files that should never be committed.
OUT=$(git ls-files 2>/dev/null | grep -E '(^|/)\.env($|\.)|\.(pem|key|crx|xpi)$|^\.output/|\.zip$' | grep -v '\.env\.example$' || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "secret or build artifact tracked by git"; else pass "no secrets/build artifacts tracked"; fi

# 3. API keys must not be written to sync, localStorage or sessionStorage.
OUT=$(hits '(storage\.sync|localStorage|sessionStorage).*(apiKey|apiKeys|api_key)|(apiKey|apiKeys|api_key).*(storage\.sync|localStorage|sessionStorage)' src || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "API key near sync/local/session storage"; else pass "keys not tied to sync/localStorage/sessionStorage"; fi
OUT=$(grep -nE "apiKeys" src/lib/storage.ts 2>/dev/null | grep -E "sync:" || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "apiKeys storage item uses sync:"; else pass "apiKeys storage item is not sync"; fi

# 4. No logging of keys, headers or auth.
OUT=$(hits 'console\.(log|info|debug|warn|error|trace)\(.*(apiKey|apiKeys|api_key|Authorization|Bearer|x-api-key|headers)' src || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "console call may log a key or auth header"; else pass "no key/auth logging"; fi

# 5. Keys must not reach the content script.
OUT=$(hits 'apiKey' src/entrypoints/content || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "content script references apiKey"; else pass "content script never references apiKey"; fi

# 6. Network calls: only the AI SDK may talk out. Raw fetch/XHR/sendBeacon/WebSocket needs review.
OUT=$(hits '(\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource)' src || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "raw network call in src (only the AI SDK may reach out)"; else pass "no raw network calls"; fi

# 7. Hard-coded external URLs (allowlist: provider hosts, localhost, docs/license links).
OUT=$(hits 'https?://' src | grep -vE 'localhost|127\.0\.0\.1|\[::1\]|router\.huggingface\.co|generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|github\.com|w3\.org|developer\.mozilla\.org|aistudio\.google\.com|platform\.openai\.com|console\.anthropic\.com|platform\.claude\.com|huggingface\.co|ollama' || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "unexpected external URL in src (new third-party endpoint?)"; else pass "only expected URLs in src"; fi

# 8. Remote code / dynamic execution.
OUT=$(hits '(\beval\(|new Function\(|<script[^>]+src=["'"'"']https?:|importScripts\()' src public || true)
if [ -n "$OUT" ]; then echo "$OUT"; fail "dynamic or remote code execution pattern"; else pass "no eval/remote scripts"; fi

# 9. Model output interpolated into HTML templates must go through escapeHtml.
# Templates span several lines, so look for interpolations of model-derived fields
# that lack escapeHtml, rather than at the innerHTML line itself.
OUT=$(hits '\$\{[^}]*(original|replacement|explanation|rewritten|suggestion|\.text|\.message|failureMessage)[^}]*\}' src/entrypoints/content | grep -vE 'escapeHtml|textContent|\.length|Count|getSuggestionColor|tooltip =|\$\{(ICONS|ACTION)' || true)
if [ -n "$OUT" ]; then echo "$OUT"; echo "  (check each: model output must pass through escapeHtml; ids/numbers/static strings are fine)"; fail "model-derived value interpolated into HTML without escapeHtml"; else pass "model-derived HTML interpolations use escapeHtml"; fi
echo "INFO: $(hits '(innerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write)' src | wc -l) HTML sinks in src; review any new ones in the diff"

# 10. Sender validation in the background listener.
if grep -qE 'sender\.id\s*!==\s*browser\.runtime\.id' src/entrypoints/background.ts 2>/dev/null; then pass "background validates sender.id"; else fail "background sender.id validation missing"; fi

# 11. Base URL validation is present and used.
if grep -rqE 'validateBaseURL' src/lib/ai/providers.ts src/entrypoints/background.ts src/lib/ai/grammar-check.ts 2>/dev/null; then pass "validateBaseURL is used on the AI path"; else fail "validateBaseURL not referenced on the AI path"; fi

# 12. Permissions stay minimal.
if [ -f wxt.config.ts ]; then
  PERMS=$(grep -nE "permissions\s*:" wxt.config.ts || true)
  echo "INFO: manifest permissions -> ${PERMS:-none found}"
  OUT=$(grep -nE "'(tabs|history|cookies|webRequest|webRequestBlocking|downloads|identity|nativeMessaging|scripting|clipboardRead|management|declarativeNetRequest)'|\"(tabs|history|cookies|webRequest|identity|nativeMessaging|management)\"" wxt.config.ts || true)
  if [ -n "$OUT" ]; then echo "$OUT"; fail "extra permission requested (needs strong reason + README update)"; else pass "no extra permissions beyond storage/activeTab"; fi
fi

# 13. Built bundles must not contain key-shaped strings.
if [ -d .output ]; then
  OUT=$(grep -rnIE "$KEY_RE" .output 2>/dev/null | cut -c1-200 || true)
  if [ -n "$OUT" ]; then echo "$OUT"; fail "key-shaped string in build output"; else pass "build output clean"; fi
else
  echo "INFO: .output missing, skipped build-output scan (run npm run build first)"
fi

# 14. Dependency vulnerabilities (needs network; skipped if npm unavailable).
if command -v npm >/dev/null 2>&1 && [ -d node_modules ]; then
  AUDIT_LOG=$(mktemp)
  if npm audit --omit=dev --audit-level=high >"$AUDIT_LOG" 2>&1; then
    pass "npm audit: no high/critical production vulnerabilities"
  else
    tail -20 "$AUDIT_LOG"
    fail "npm audit reported high/critical issues (or could not reach the registry)"
  fi
  rm -f "$AUDIT_LOG"
else
  echo "INFO: skipped npm audit (npm or node_modules unavailable here; run it from PowerShell: npm audit --omit=dev)"
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "RESULT: all checks passed"; exit 0; fi
echo "RESULT: $FAILS check(s) failed"; exit 1
