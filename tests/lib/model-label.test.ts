import { describe, expect, it } from 'vitest';
import { getModelLabel } from '@/lib/model-label';
import { DEFAULT_SETTINGS } from '@/types';

describe('getModelLabel', () => {
  it('names the provider and model', () => {
    expect(getModelLabel({ ...DEFAULT_SETTINGS, provider: 'anthropic', model: 'claude-haiku-5-5' })).toBe(
      'Anthropic Claude · claude-haiku-5-5',
    );
  });

  it('uses the custom model id', () => {
    expect(getModelLabel({ ...DEFAULT_SETTINGS, provider: 'openai', model: 'custom', customModel: 'my-model' })).toBe(
      'OpenAI · my-model',
    );
  });

  it('names the host for a custom OpenAI-compatible endpoint', () => {
    expect(
      getModelLabel({
        ...DEFAULT_SETTINGS,
        provider: 'openai',
        model: 'custom',
        customModel: 'qwen3:8b',
        openAIBaseURL: 'http://localhost:11434/v1',
      }),
    ).toBe('qwen3:8b · localhost');
  });
});
