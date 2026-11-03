import { AI_PROVIDER, CHECK_GRAMMAR_COMMAND, CUSTOM_INSTRUCTIONS_MAX_LENGTH, CUSTOM_MODEL, MESSAGE_TYPE, PROVIDER_CHOICES, REWRITE_STYLE, REWRITE_STYLES } from '@/types';
import { checkGrammar, rewriteText } from '@/lib/ai/grammar-check';
import { LOCAL_API_KEY_PLACEHOLDER } from '@/lib/ai/base-url';
import { isProviderReady } from '@/lib/provider-ready';
import { getModelLabel } from '@/lib/model-label';
import { visibleLength } from '@/lib/utils';
import { settingsStorage, apiKeysStorage, getCachedResult, setCachedResult, incrementStats, dictionaryStorage, migrateLegacyLocalProvider } from '@/lib/storage';
import type { GrammarSuggestion, Message, RewriteStyle, Settings } from '@/types';
import { TRANSLATE_LANGUAGES } from '@/types';


// Throws a user-readable error when the selected provider has no key, so both
// CHECK_GRAMMAR and REWRITE_TEXT report it through handleMessage's catch.
async function resolveModelOptions(settings: Settings) {
  const apiKeys = await apiKeysStorage.getValue();
  const isLocal = settings.provider === AI_PROVIDER.LOCAL;
  const apiKey = apiKeys[settings.provider] || (isLocal ? LOCAL_API_KEY_PLACEHOLDER : '');
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${settings.provider}. Please add your API key in the extension settings.`
    );
  }

  const modelId = settings.model === CUSTOM_MODEL ? settings.customModel : settings.model;
  return {
    provider: settings.provider,
    model: modelId || settings.model,
    apiKey,
    baseURL: isLocal ? settings.localBaseURL : undefined,
  };
}

// Hugging Face's raw errors don't say where to fix the problem, so replace them with ones that do
// Ollama says: model 'name' not found. Quoting the name back makes the fix copy-pasteable.
const OLLAMA_MODEL_NOT_FOUND = /model\s+["'`]?([^\s"'`]+)["'`]?\s+not found/i;

const PROVIDER_ERROR_HINTS: { pattern: RegExp; message: (raw: string) => string }[] = [
  {
    pattern: OLLAMA_MODEL_NOT_FOUND,
    message: (raw) => {
      const model = raw.match(OLLAMA_MODEL_NOT_FOUND)?.[1] ?? 'qwen3:8b';
      return `The model "${model}" isn't downloaded. Open a terminal and run: ollama pull ${model}  (then try again, or pick another model in settings).`;
    },
  },
  {
    // The server is down or the request never left the browser (a blocked origin looks the same)
    pattern: /failed to fetch|cannot connect to api|econnrefused|networkerror/i,
    message: (raw) =>
      `${raw} Couldn't reach the AI server. For a local model, make sure Ollama is running and OLLAMA_ORIGINS is set (see the README), or check your internet connection.`,
  },
  {
    pattern: /\bforbidden\b|\b403\b/i,
    message: (raw) =>
      `${raw} If you use Ollama, set OLLAMA_ORIGINS to allow the extension and restart Ollama (see the README).`,
  },
  {
    // HTTP 402: the free monthly Inference Providers allowance is tiny and runs out quickly
    pattern: /no remaining credits|pre-paid credits/i,
    message: () =>
      'Your Hugging Face credits are used up. Add pre-paid credits or subscribe to PRO at huggingface.co/settings/billing, or switch to another provider (a local model through Ollama is free).',
  },
  {
    // The router only uses the inference providers enabled in the user's HF account
    pattern: /not supported by any provider you have enabled/i,
    message: (raw) =>
      `${raw} Pick another model, or enable more providers at huggingface.co/settings/inference-providers.`,
  },
];

// Some endpoints (Hugging Face's 402, for one) reply with a body the SDK can't
// turn into a message, leaving error.message empty. The content script treats
// an empty error as "no response", so recover text from the HTTP details.
const ERROR_BODY_MAX_LENGTH = 300;

// Bodies look like {"error":"..."} or {"error":{"message":"..."}}; show just the text
function unwrapErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    const inner = parsed?.error;
    if (typeof inner === 'string' && inner.trim()) return inner.trim();
    const nested = (inner as { message?: unknown } | undefined)?.message;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    if (typeof parsed?.message === 'string' && parsed.message.trim()) return parsed.message.trim();
  } catch {
    // Not JSON; show it as is
  }
  return body;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error occurred';
  if (error.message.trim()) return error.message;
  const { statusCode, responseBody } = error as { statusCode?: unknown; responseBody?: unknown };
  if (typeof responseBody === 'string' && responseBody.trim()) {
    return unwrapErrorBody(responseBody.trim()).slice(0, ERROR_BODY_MAX_LENGTH);
  }
  if (typeof statusCode === 'number') return `The AI provider returned HTTP ${statusCode}.`;
  return 'The AI provider returned an error with no details.';
}

function withProviderHint(message: string): string {
  const hint = PROVIDER_ERROR_HINTS.find(({ pattern }) => pattern.test(message));
  return hint ? hint.message(message) : message;
}

export default defineBackground(() => {
  migrateLegacyLocalProvider().catch((error) => console.error('Failed to migrate local model settings:', error));

  // Handle messages from content scripts and popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only accept messages from this extension's own pages and content scripts
    if (sender.id !== browser.runtime.id) return false;
    handleMessage(message, sendResponse);
    return true; // Keep the message channel open for async response
  });

  // Handle keyboard shortcut
  browser.commands.onCommand.addListener(async (command) => {
    if (command === CHECK_GRAMMAR_COMMAND) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        browser.tabs.sendMessage(tab.id, { type: MESSAGE_TYPE.TRIGGER_CHECK });
      }
    }
  });

  async function handleMessage(
    message: Message,
    sendResponse: (response: unknown) => void
  ) {
    try {
      switch (message.type) {
        case MESSAGE_TYPE.CHECK_GRAMMAR: {
          const { text, forceCheck } = message.payload as { text: string; forceCheck?: boolean };

          // The content script already skips short text; this keeps any other
          // sender from spending an AI call on it.
          if (visibleLength(text) < 3) {
            sendResponse({ success: true, result: { suggestions: [] } });
            return;
          }

          const settings = await settingsStorage.getValue();
          const customInstructions = settings.customInstructions.trim().slice(0, CUSTOM_INSTRUCTIONS_MAX_LENGTH);
          // Different instructions give different suggestions for the same text
          const cacheSalt = customInstructions ? `\u0000${customInstructions}` : '';

          // Check cache first (unless force check is requested)
          if (!forceCheck) {
            const cached = await getCachedResult(text, cacheSalt);
            // Entries cached before results carried a model label would show no
            // "Checked by" footer, so re-check those instead.
            if (cached?.result.modelLabel) {
              sendResponse({ success: true, result: cached.result });
              return;
            }
          }

          const result = await checkGrammar(text, {
            ...(await resolveModelOptions(settings)),
            language: settings.language,
            customInstructions,
          });

          // Filter out words in personal dictionary
          const dictionary = await dictionaryStorage.getValue();
          result.suggestions = result.suggestions.filter((s: GrammarSuggestion) => {
            if (s.type === 'spelling') {
              return !dictionary.includes(s.original.toLowerCase());
            }
            return true;
          });
          result.modelLabel = getModelLabel(settings);

          // Cache the result
          await setCachedResult(text, {
            text,
            result,
            timestamp: Date.now(),
          }, cacheSalt);

          // Update stats
          await incrementStats('checksPerformed');
          await incrementStats('errorsFound', result.suggestions.length);

          sendResponse({ success: true, result });
          break;
        }

        case MESSAGE_TYPE.REWRITE_TEXT: {
          const { text, style, targetLanguage } = message.payload as {
            text: string;
            style: RewriteStyle;
            targetLanguage?: string;
          };
          if (!REWRITE_STYLES.includes(style)) {
            sendResponse({ success: false, error: `Unknown rewrite style: ${style}` });
            return;
          }

          // Only known codes reach the prompt, so the payload can't inject
          // arbitrary instructions through the language name.
          let targetLanguageName: string | undefined;
          if (style === REWRITE_STYLE.TRANSLATE) {
            targetLanguageName = TRANSLATE_LANGUAGES.find((lang) => lang.code === targetLanguage)?.name;
            if (!targetLanguageName) {
              sendResponse({ success: false, error: `Unsupported target language: ${targetLanguage}` });
              return;
            }
          }

          const settings = await settingsStorage.getValue();
          const rewritten = await rewriteText(text, style, {
            ...(await resolveModelOptions(settings)),
            targetLanguage: targetLanguageName,
            customInstructions: settings.customInstructions,
          });

          sendResponse({ success: true, result: rewritten, modelLabel: getModelLabel(settings) });
          break;
        }

        // Content scripts can't call openOptionsPage themselves
        case MESSAGE_TYPE.OPEN_OPTIONS: {
          await browser.runtime.openOptionsPage();
          sendResponse({ success: true });
          break;
        }

        case MESSAGE_TYPE.GET_SETTINGS: {
          const settings = await settingsStorage.getValue();
          const apiKeys = await apiKeysStorage.getValue();
          sendResponse({
            success: true,
            settings,
            hasApiKey: Object.fromEntries(PROVIDER_CHOICES.map(({ id }) => [id, isProviderReady(id, apiKeys)])),
          });
          break;
        }

        case MESSAGE_TYPE.ADD_TO_DICTIONARY: {
          const { word } = message.payload as { word: string };
          const dictionary = await dictionaryStorage.getValue();
          if (!dictionary.includes(word.toLowerCase())) {
            await dictionaryStorage.setValue([...dictionary, word.toLowerCase()]);
          }
          sendResponse({ success: true });
          break;
        }

        case MESSAGE_TYPE.CORRECTION_APPLIED: {
          await incrementStats('correctionsApplied');
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({
        success: false,
        error: withProviderHint(describeError(error)),
      });
    }
  }
});
