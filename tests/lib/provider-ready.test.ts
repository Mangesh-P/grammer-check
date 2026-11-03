import { describe, expect, it } from 'vitest';
import { hasUsableProvider, isProviderReady } from '@/lib/provider-ready';

describe('isProviderReady', () => {
  it('treats the local model as ready without a key', () => {
    expect(isProviderReady('local', {})).toBe(true);
  });

  it('needs a saved key for cloud providers', () => {
    expect(isProviderReady('openai', {})).toBe(false);
    expect(isProviderReady('openai', { openai: 'k' })).toBe(true);
  });
});

describe('hasUsableProvider', () => {
  it('is true for the local model or when any cloud key is saved', () => {
    expect(hasUsableProvider('local', {})).toBe(true);
    expect(hasUsableProvider('google', { anthropic: 'k' })).toBe(true);
    expect(hasUsableProvider('google', {})).toBe(false);
  });

  it('ignores a saved local key when the active provider is a cloud one', () => {
    expect(hasUsableProvider('google', { local: 'k' })).toBe(false);
  });
});
