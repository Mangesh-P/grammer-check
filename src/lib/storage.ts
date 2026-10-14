import type { APIKeys, Settings, CacheEntry, Stats } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '@/types';

type StorageAreaName = 'sync' | 'local';

export interface StorageItem<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
  watch(callback: (value: T) => void): () => void;
}

// Object-valued items are merged over their defaults so fields added in later versions
// are never undefined for users with older stored data
function withDefaults<T>(stored: T | undefined, defaultValue: T): T {
  if (stored === undefined || stored === null) return defaultValue;
  if (typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
    return { ...defaultValue, ...stored };
  }
  return stored;
}

function createStorageItem<T>(area: StorageAreaName, key: string, defaultValue: T): StorageItem<T> {
  return {
    async getValue() {
      const result = await browser.storage[area].get(key);
      return withDefaults(result[key] as T | undefined, defaultValue);
    },
    async setValue(value) {
      await browser.storage[area].set({ [key]: value });
    },
    watch(callback) {
      const listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => {
        if (areaName === area && changes[key]) {
          callback(withDefaults(changes[key].newValue as T | undefined, defaultValue));
        }
      };
      browser.storage.onChanged.addListener(listener);
      return () => browser.storage.onChanged.removeListener(listener);
    },
  };
}

// API Keys storage (local only - never synced to the browser account / other devices)
export const apiKeysStorage = createStorageItem<APIKeys>('local', 'apiKeys', {});

export const settingsStorage = createStorageItem<Settings>('sync', 'settings', DEFAULT_SETTINGS);

export const dictionaryStorage = createStorageItem<string[]>('sync', 'dictionary', []);

export const statsStorage = createStorageItem<Stats>('sync', 'stats', DEFAULT_STATS);

// Merges a patch into the latest stored settings rather than writing a whole object held in
// UI state, so a change made in another extension page (popup vs options) isn't overwritten
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await settingsStorage.getValue();
  const next = { ...current, ...patch };
  await settingsStorage.setValue(next);
  return next;
}

// Cache storage (local only)
export const cacheStorage = createStorageItem<Record<string, CacheEntry>>('local', 'cache', {});

// Helper functions
export async function getApiKey(provider: keyof APIKeys): Promise<string | undefined> {
  const keys = await apiKeysStorage.getValue();
  return keys[provider];
}

// An empty key removes the provider's entry instead of storing ''
export async function setApiKey(provider: keyof APIKeys, key: string): Promise<void> {
  const { [provider]: _previous, ...rest } = await apiKeysStorage.getValue();
  await apiKeysStorage.setValue(key ? { ...rest, [provider]: key } : rest);
}

export async function getCachedResult(text: string): Promise<CacheEntry | undefined> {
  const cache = await cacheStorage.getValue();
  const hash = hashText(text);
  const entry = cache[hash];

  // Cache expires after 1 hour
  if (entry && Date.now() - entry.timestamp < 3600000) {
    return entry;
  }

  return undefined;
}

export async function setCachedResult(text: string, entry: CacheEntry): Promise<void> {
  const cache = await cacheStorage.getValue();
  const hash = hashText(text);

  // Limit cache size to 100 entries
  const entries = Object.entries(cache);
  if (entries.length >= 100) {
    // Remove oldest entries
    const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, 20);
    for (const [key] of toRemove) delete cache[key];
  }

  cache[hash] = entry;
  await cacheStorage.setValue(cache);
}

export async function addToDictionary(word: string): Promise<void> {
  const dictionary = await dictionaryStorage.getValue();
  if (!dictionary.includes(word.toLowerCase())) {
    await dictionaryStorage.setValue([...dictionary, word.toLowerCase()]);
  }
}

export async function removeFromDictionary(word: string): Promise<void> {
  const dictionary = await dictionaryStorage.getValue();
  await dictionaryStorage.setValue(dictionary.filter((w) => w !== word));
}

export async function isInDictionary(word: string): Promise<boolean> {
  const dictionary = await dictionaryStorage.getValue();
  return dictionary.includes(word.toLowerCase());
}

export async function incrementStats(field: 'checksPerformed' | 'errorsFound' | 'correctionsApplied', amount = 1): Promise<void> {
  const stats = await statsStorage.getValue();
  await statsStorage.setValue({
    ...stats,
    [field]: stats[field] + amount,
  });
}

// Simple hash function for caching
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
