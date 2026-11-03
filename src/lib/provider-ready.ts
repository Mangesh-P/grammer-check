import { AI_PROVIDER, PROVIDERS } from '@/types';
import type { AIProvider, APIKeys } from '@/types';

// A local model needs no key, so it is always ready; cloud providers need a saved one
export function isProviderReady(provider: AIProvider, apiKeys: APIKeys): boolean {
  return provider === AI_PROVIDER.LOCAL || !!apiKeys[provider];
}

// True when the extension can run at all: the active provider is usable or any key is saved
export function hasUsableProvider(active: AIProvider, apiKeys: APIKeys): boolean {
  return isProviderReady(active, apiKeys) || PROVIDERS.some((p) => apiKeys[p.id]);
}
