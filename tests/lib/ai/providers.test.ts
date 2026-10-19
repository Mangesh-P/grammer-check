import { beforeEach, describe, expect, it, vi } from 'vitest';

const factories = vi.hoisted(() => {
  const model = (name: string) => {
    const provider = vi.fn((id: string) => ({ provider: name, id, kind: 'default' }));
    return Object.assign(provider, {
      chatModel: vi.fn((id: string) => ({ provider: name, id, kind: 'chat' })),
    });
  };
  return {
    google: vi.fn(() => model('google')),
    openai: vi.fn(() => model('openai')),
    compatible: vi.fn(() => model('compatible')),
    anthropic: vi.fn(() => model('anthropic')),
  };
});

vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: factories.google }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: factories.openai }));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: factories.compatible }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: factories.anthropic }));

import { createAIProvider, getModel, getReasoning, isOpenAICompatible } from '@/lib/ai/providers';
import type { AIProvider } from '@/types';

beforeEach(() => {
  for (const f of Object.values(factories)) f.mockClear();
});

describe('createAIProvider', () => {
  it('creates native providers with the API key only', () => {
    createAIProvider('google', 'g');
    createAIProvider('openai', 'o');
    createAIProvider('anthropic', 'a');
    expect(factories.google).toHaveBeenCalledWith({ apiKey: 'g' });
    expect(factories.openai).toHaveBeenCalledWith({ apiKey: 'o' });
    expect(factories.anthropic).toHaveBeenCalledWith({
      apiKey: 'a',
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    });
  });

  it('uses an OpenAI-compatible client with a validated base URL for OpenAI + baseURL', () => {
    createAIProvider('openai', 'o', 'http://localhost:11434/v1/');
    expect(factories.compatible).toHaveBeenCalledWith({
      name: 'openai-compatible',
      apiKey: 'o',
      baseURL: 'http://localhost:11434/v1',
    });
    expect(factories.openai).not.toHaveBeenCalled();
  });

  it('rejects an insecure base URL', () => {
    expect(() => createAIProvider('openai', 'o', 'http://example.com')).toThrow();
  });

  it('uses the fixed Hugging Face router', () => {
    createAIProvider('huggingface', 'hf');
    expect(factories.compatible).toHaveBeenCalledWith({
      name: 'huggingface',
      apiKey: 'hf',
      baseURL: 'https://router.huggingface.co/v1',
    });
  });

  it('throws for an unknown provider', () => {
    expect(() => createAIProvider('nope' as AIProvider, 'k')).toThrow('Unknown provider: nope');
  });
});

describe('isOpenAICompatible / getReasoning', () => {
  it.each([
    ['google', undefined, false],
    ['anthropic', undefined, false],
    ['openai', undefined, false],
    ['openai', 'http://localhost:1/v1', true],
    ['huggingface', undefined, true],
  ] as const)('%s with %s', (provider, baseURL, compatible) => {
    expect(isOpenAICompatible(provider, baseURL)).toBe(compatible);
    expect(getReasoning(provider, baseURL)).toBe(compatible ? undefined : 'none');
  });
});

describe('getModel', () => {
  it('uses chatModel for OpenAI-compatible endpoints', () => {
    expect(getModel('huggingface', 'm', 'k')).toEqual({ provider: 'compatible', id: 'm', kind: 'chat' });
    expect(getModel('openai', 'qwen3:8b', 'k', 'http://localhost:1')).toMatchObject({ kind: 'chat' });
  });

  it('calls native providers directly', () => {
    expect(getModel('anthropic', 'claude', 'k')).toEqual({ provider: 'anthropic', id: 'claude', kind: 'default' });
  });
});
