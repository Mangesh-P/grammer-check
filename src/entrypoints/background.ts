import { AI_PROVIDER, PROVIDERS, REWRITE_STYLE, REWRITE_STYLES } from '@/types';
import { checkGrammar, rewriteText } from '@/lib/ai/grammar-check';
import { settingsStorage, apiKeysStorage, getCachedResult, setCachedResult, incrementStats, dictionaryStorage } from '@/lib/storage';
import type { GrammarSuggestion, RewriteStyle, Settings } from '@/types';
import { TRANSLATE_LANGUAGES } from '@/types';


// Throws a user-readable error when the selected provider has no key, so both
// CHECK_GRAMMAR and REWRITE_TEXT report it through handleMessage's catch.
async function resolveModelOptions(settings: Settings) {
  const apiKeys = await apiKeysStorage.getValue();
  const apiKey = apiKeys[settings.provider];
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${settings.provider}. Please add your API key in the extension settings.`
    );
  }

  const modelId = settings.model === 'custom' ? settings.customModel : settings.model;
  return {
    provider: settings.provider,
    model: modelId || settings.model,
    apiKey,
    baseURL: settings.provider === AI_PROVIDER.OPENAI ? settings.openAIBaseURL : undefined,
  };
}

// Hugging Face's raw errors don't say where to fix the problem, so replace them with ones that do
const PROVIDER_ERROR_HINTS: { pattern: RegExp; message: (raw: string) => string }[] = [
  {
    // HTTP 402: the free monthly Inference Providers allowance is tiny and runs out quickly
    pattern: /no remaining credits/i,
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

function withProviderHint(message: string): string {
  const hint = PROVIDER_ERROR_HINTS.find(({ pattern }) => pattern.test(message));
  return hint ? hint.message(message) : message;
}

export default defineBackground(() => {

  // Handle messages from content scripts and popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only accept messages from this extension's own pages and content scripts
    if (sender.id !== browser.runtime.id) return false;
    handleMessage(message, sendResponse);
    return true; // Keep the message channel open for async response
  });

  // Handle keyboard shortcut
  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'check-grammar') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_CHECK' });
      }
    }
  });

  async function handleMessage(
    message: { type: string; payload?: unknown },
    sendResponse: (response: unknown) => void
  ) {
    try {
      switch (message.type) {
        case 'CHECK_GRAMMAR': {
          const { text, forceCheck } = message.payload as { text: string; forceCheck?: boolean };

          // Check cache first (unless force check is requested)
          if (!forceCheck) {
            const cached = await getCachedResult(text);
            if (cached) {
              sendResponse({ success: true, result: cached.result });
              return;
            }
          }

          const settings = await settingsStorage.getValue();
          const result = await checkGrammar(text, {
            ...(await resolveModelOptions(settings)),
            language: settings.language,
          });

          // Filter out words in personal dictionary
          const dictionary = await dictionaryStorage.getValue();
          result.suggestions = result.suggestions.filter((s: GrammarSuggestion) => {
            if (s.type === 'spelling') {
              return !dictionary.includes(s.original.toLowerCase());
            }
            return true;
          });

          // Cache the result
          await setCachedResult(text, {
            text,
            result,
            timestamp: Date.now(),
          });

          // Update stats
          await incrementStats('checksPerformed');
          await incrementStats('errorsFound', result.suggestions.length);

          sendResponse({ success: true, result });
          break;
        }

        case 'REWRITE_TEXT': {
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
          });

          sendResponse({ success: true, result: rewritten });
          break;
        }

        case 'GET_SETTINGS': {
          const settings = await settingsStorage.getValue();
          const apiKeys = await apiKeysStorage.getValue();
          sendResponse({
            success: true,
            settings,
            hasApiKey: Object.fromEntries(PROVIDERS.map(({ id }) => [id, !!apiKeys[id]])),
          });
          break;
        }

        case 'ADD_TO_DICTIONARY': {
          const { word } = message.payload as { word: string };
          const dictionary = await dictionaryStorage.getValue();
          if (!dictionary.includes(word.toLowerCase())) {
            await dictionaryStorage.setValue([...dictionary, word.toLowerCase()]);
          }
          sendResponse({ success: true });
          break;
        }

        case 'CORRECTION_APPLIED': {
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
        error: error instanceof Error ? withProviderHint(error.message) : 'Unknown error occurred',
      });
    }
  }
});
