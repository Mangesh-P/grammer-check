// Values are also the keys of the stored APIKeys object, so they must never change
export const AI_PROVIDER = {
  GOOGLE: 'google',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  HUGGING_FACE: 'huggingface',
} as const;

export type AIProvider = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

export type CheckMode = 'realtime' | 'ondemand';

export type SuggestionType = 'grammar' | 'spelling' | 'style' | 'punctuation';

// Everything the selection menu can do. Proofread and translate share the
// rewrite pipeline (text in, text out, preview, Replace) but use their own
// system prompts; translate also needs a target language.
export const REWRITE_STYLE = {
  FORMAL: 'formal',
  CASUAL: 'casual',
  CONCISE: 'concise',
  ELABORATE: 'elaborate',
  PROOFREAD: 'proofread',
  TRANSLATE: 'translate',
} as const;

export type RewriteStyle = (typeof REWRITE_STYLE)[keyof typeof REWRITE_STYLE];

export const REWRITE_STYLES: RewriteStyle[] = Object.values(REWRITE_STYLE);

// settings.model value meaning "use settings.customModel"
export const CUSTOM_MODEL = 'custom';

// settings.language value meaning "let the model detect the language"
export const AUTO_LANGUAGE = 'auto';

// Manifest command id; wxt.config.ts declares it and the background listens for it
export const CHECK_GRAMMAR_COMMAND = 'check-grammar';

export type APIKeys = Partial<Record<AIProvider, string>>;

export interface Settings {
  provider: AIProvider;
  model: string;
  customModel?: string;
  openAIBaseURL?: string;
  checkMode: CheckMode;
  language: string;
  enabled: boolean;
  realtimeDelay: number;
  rewriteMenu: boolean;
  // Language code from SUPPORTED_LANGUAGES (never AUTO_LANGUAGE); the last target
  // picked in the Translate menu, listed first next time.
  translateTo: string;
}

export interface GrammarSuggestion {
  id: string;
  original: string;
  replacement: string;
  explanation: string;
  type: SuggestionType;
  startIndex: number;
  endIndex: number;
}

export interface GrammarCheckResult {
  suggestions: GrammarSuggestion[];
  text: string;
  language: string;
  timestamp: number;
}

export interface TextFieldInfo {
  id: string;
  element: HTMLElement;
  text: string;
  rect: DOMRect;
}

export interface CacheEntry {
  text: string;
  result: GrammarCheckResult;
  timestamp: number;
}

export interface Stats {
  checksPerformed: number;
  errorsFound: number;
  correctionsApplied: number;
}

export const DEFAULT_STATS: Stats = {
  checksPerformed: 0,
  errorsFound: 0,
  correctionsApplied: 0,
};

export interface ProviderMeta {
  id: AIProvider;
  name: string;
  keyUrl: string;
  keyPlaceholder: string;
}

export const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  [AI_PROVIDER.GOOGLE]: {
    id: AI_PROVIDER.GOOGLE,
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
  },
  [AI_PROVIDER.OPENAI]: {
    id: AI_PROVIDER.OPENAI,
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
  },
  [AI_PROVIDER.ANTHROPIC]: {
    id: AI_PROVIDER.ANTHROPIC,
    name: 'Anthropic Claude',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
  },
  [AI_PROVIDER.HUGGING_FACE]: {
    id: AI_PROVIDER.HUGGING_FACE,
    name: 'Hugging Face',
    keyUrl: 'https://huggingface.co/settings/tokens',
    keyPlaceholder: 'hf_…',
  },
};

export const PROVIDERS: ProviderMeta[] = Object.values(PROVIDER_META);

export const DEFAULT_SETTINGS: Settings = {
  provider: AI_PROVIDER.GOOGLE,
  model: 'gemini-3.8-flash',
  openAIBaseURL: '',
  checkMode: 'realtime',
  language: AUTO_LANGUAGE,
  enabled: true,
  realtimeDelay: 500,
  rewriteMenu: true,
  translateTo: 'en',
};

export const AVAILABLE_MODELS: Record<AIProvider, { id: string; name: string }[]> = {
  [AI_PROVIDER.GOOGLE]: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Recommended)' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (Fastest)' },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
  ],
  [AI_PROVIDER.OPENAI]: [
    { id: 'gpt-6-luna', name: 'GPT-6 Luna (Recommended)' },
    { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
    { id: 'gpt-6-astra', name: 'GPT-6 Astra (Most capable)' },
  ],
  [AI_PROVIDER.ANTHROPIC]: [
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 (Recommended)' },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 (Most capable)' },
  ],
  // Served through Hugging Face Inference Providers. The router only uses providers enabled in the
  // user's HF account, so these are models that many providers serve; any other chat model ID works as a custom model
  [AI_PROVIDER.HUGGING_FACE]: [
    { id: 'openai/gpt-oss-120b', name: 'gpt-oss 120B (Recommended)' },
    { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct' },
    { id: 'openai/gpt-oss-20b', name: 'gpt-oss 20B (Fastest)' },
    { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct' },
  ],
};

export const SUPPORTED_LANGUAGES = [
  { code: AUTO_LANGUAGE, name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'it', name: 'Italian (Italiano)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'nl', name: 'Dutch (Nederlands)' },
  { code: 'pl', name: 'Polish (Polski)' },
  { code: 'ru', name: 'Russian (Русский)' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'zh', name: 'Chinese (中文)' },
];

// Translate-only targets: models translate into these well, but grammar checking them is unreliable
export const TRANSLATE_LANGUAGES = [
  ...SUPPORTED_LANGUAGES.filter((lang) => lang.code !== AUTO_LANGUAGE),
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
];

// Shared by the sender (content script / background) and the receiver, so a
// typo becomes a compile error instead of a message that silently falls through
export const MESSAGE_TYPE = {
  CHECK_GRAMMAR: 'CHECK_GRAMMAR',
  REWRITE_TEXT: 'REWRITE_TEXT',
  GET_SETTINGS: 'GET_SETTINGS',
  ADD_TO_DICTIONARY: 'ADD_TO_DICTIONARY',
  CORRECTION_APPLIED: 'CORRECTION_APPLIED',
  TRIGGER_CHECK: 'TRIGGER_CHECK',
} as const;

export type MessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}
