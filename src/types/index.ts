export type AIProvider = 'google' | 'openai' | 'anthropic';

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

export interface APIKeys {
  google?: string;
  openai?: string;
  anthropic?: string;
}

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
  // Language code from SUPPORTED_LANGUAGES (never 'auto'); the last target
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
  google: {
    id: 'google',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
  },
};

export const PROVIDERS: ProviderMeta[] = Object.values(PROVIDER_META);

export const DEFAULT_SETTINGS: Settings = {
  provider: 'google',
  model: 'gemini-2.5-flash',
  openAIBaseURL: '',
  checkMode: 'realtime',
  language: 'auto',
  enabled: true,
  realtimeDelay: 500,
  rewriteMenu: true,
  translateTo: 'en',
};

export const AVAILABLE_MODELS: Record<AIProvider, { id: string; name: string }[]> = {
  google: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recommended)' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Fastest)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recommended)' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'o1-mini', name: 'o1 Mini (Reasoning)' },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Recommended)' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
  ],
};

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
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

export const TRANSLATE_LANGUAGES = SUPPORTED_LANGUAGES.filter((lang) => lang.code !== 'auto');

export type MessageType =
  | 'CHECK_GRAMMAR'
  | 'GRAMMAR_RESULT'
  | 'GET_SETTINGS'
  | 'SETTINGS_UPDATED'
  | 'APPLY_SUGGESTION'
  | 'TOGGLE_EXTENSION';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}
