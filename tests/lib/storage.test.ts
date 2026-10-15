import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addToDictionary,
  apiKeysStorage,
  cacheStorage,
  dictionaryStorage,
  getApiKey,
  getCachedResult,
  incrementStats,
  isInDictionary,
  removeFromDictionary,
  setApiKey,
  setCachedResult,
  settingsStorage,
  statsStorage,
  updateSettings,
} from '@/lib/storage';
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '@/types';
import type { CacheEntry } from '@/types';

function entry(text: string, timestamp: number): CacheEntry {
  return { text, timestamp, result: { suggestions: [], text, language: 'en', timestamp } };
}

describe('storage items', () => {
  it('return defaults when nothing is stored', async () => {
    expect(await settingsStorage.getValue()).toEqual(DEFAULT_SETTINGS);
    expect(await statsStorage.getValue()).toEqual(DEFAULT_STATS);
    expect(await dictionaryStorage.getValue()).toEqual([]);
    expect(await apiKeysStorage.getValue()).toEqual({});
  });

  it('merge stored objects over defaults so new fields are never undefined', async () => {
    await fakeBrowser.storage.sync.set({ settings: { enabled: false } });
    expect(await settingsStorage.getValue()).toEqual({ ...DEFAULT_SETTINGS, enabled: false });
  });

  it('do not merge arrays', async () => {
    await fakeBrowser.storage.sync.set({ dictionary: ['foo'] });
    expect(await dictionaryStorage.getValue()).toEqual(['foo']);
  });

  it('keep API keys in local storage, never sync', async () => {
    await apiKeysStorage.setValue({ google: 'k' });
    expect(await fakeBrowser.storage.local.get('apiKeys')).toEqual({ apiKeys: { google: 'k' } });
    expect(await fakeBrowser.storage.sync.get('apiKeys')).toEqual({});
  });

  it('keep settings, dictionary and stats in sync storage and the cache in local', async () => {
    await settingsStorage.setValue(DEFAULT_SETTINGS);
    await dictionaryStorage.setValue(['a']);
    await statsStorage.setValue(DEFAULT_STATS);
    await cacheStorage.setValue({});
    expect(Object.keys(await fakeBrowser.storage.sync.get(null)).sort()).toEqual(['dictionary', 'settings', 'stats']);
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual(['cache']);
  });

  it('watch only its own key and area, with defaults applied, and can unsubscribe', async () => {
    const callback = vi.fn();
    const unwatch = settingsStorage.watch(callback);

    await fakeBrowser.storage.local.set({ settings: { enabled: false } });
    await fakeBrowser.storage.sync.set({ other: 1 });
    expect(callback).not.toHaveBeenCalled();

    await fakeBrowser.storage.sync.set({ settings: { enabled: false } });
    expect(callback).toHaveBeenCalledExactlyOnceWith({ ...DEFAULT_SETTINGS, enabled: false });

    unwatch();
    await fakeBrowser.storage.sync.set({ settings: { enabled: true } });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('watch reports defaults when the key is removed', async () => {
    await settingsStorage.setValue({ ...DEFAULT_SETTINGS, enabled: false });
    const callback = vi.fn();
    settingsStorage.watch(callback);
    await fakeBrowser.storage.sync.remove('settings');
    expect(callback).toHaveBeenCalledWith(DEFAULT_SETTINGS);
  });
});

describe('updateSettings', () => {
  it('merges a patch into the latest stored settings', async () => {
    await settingsStorage.setValue({ ...DEFAULT_SETTINGS, language: 'de' });
    const next = await updateSettings({ enabled: false });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, language: 'de', enabled: false });
    expect(await settingsStorage.getValue()).toEqual(next);
  });
});

describe('API keys', () => {
  it('stores and reads a key', async () => {
    await setApiKey('openai', 'sk-1');
    expect(await getApiKey('openai')).toBe('sk-1');
    expect(await getApiKey('google')).toBeUndefined();
  });

  it('removes the entry for an empty key instead of storing an empty string', async () => {
    await setApiKey('openai', 'sk-1');
    await setApiKey('google', 'g');
    await setApiKey('openai', '');
    expect(await apiKeysStorage.getValue()).toEqual({ google: 'g' });
  });
});

describe('results cache', () => {
  it('returns a fresh entry and ignores expired ones', async () => {
    vi.useFakeTimers({ now: 10_000_000 });
    await setCachedResult('hello', entry('hello', Date.now()));
    expect((await getCachedResult('hello'))?.text).toBe('hello');
    expect(await getCachedResult('other')).toBeUndefined();

    vi.setSystemTime(10_000_000 + 60 * 60 * 1000);
    expect(await getCachedResult('hello')).toBeUndefined();
  });

  it('does not resurrect entries after the cache is cleared', async () => {
    await setCachedResult('first', entry('first', Date.now()));
    await fakeBrowser.storage.local.remove('cache');
    await setCachedResult('second', entry('second', Date.now()));
    expect(Object.values(await cacheStorage.getValue()).map((e) => e.text)).toEqual(['second']);
  });

  it('evicts the oldest 20 entries once 100 are stored', async () => {
    for (let i = 0; i < 100; i++) await setCachedResult(`text ${i}`, entry(`text ${i}`, i));
    expect(Object.keys(await cacheStorage.getValue())).toHaveLength(100);

    await setCachedResult('newest', entry('newest', 1000));
    const texts = Object.values(await cacheStorage.getValue()).map((e) => e.text);
    expect(texts).toHaveLength(81);
    expect(texts).toContain('newest');
    expect(texts).not.toContain('text 0');
    expect(texts).not.toContain('text 19');
    expect(texts).toContain('text 20');
  });
});

describe('dictionary', () => {
  it('adds lowercase words once', async () => {
    await addToDictionary('Foo');
    await addToDictionary('foo');
    expect(await dictionaryStorage.getValue()).toEqual(['foo']);
    expect(await isInDictionary('FOO')).toBe(true);
    expect(await isInDictionary('bar')).toBe(false);
  });

  it('removes a word', async () => {
    await dictionaryStorage.setValue(['a', 'b']);
    await removeFromDictionary('a');
    expect(await dictionaryStorage.getValue()).toEqual(['b']);
  });
});

describe('incrementStats', () => {
  it('increments by one or by an amount', async () => {
    await incrementStats('checksPerformed');
    await incrementStats('errorsFound', 3);
    expect(await statsStorage.getValue()).toEqual({ checksPerformed: 1, errorsFound: 3, correctionsApplied: 0 });
  });
});
