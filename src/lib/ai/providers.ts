import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { AIProvider } from '@/types';
import { validateBaseURL } from './base-url';

export function createAIProvider(
  provider: AIProvider,
  apiKey: string,
  baseURL?: string
) {
  switch (provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey });

    case 'openai':
      if (baseURL) {
        return createOpenAICompatible({
          name: 'openai-compatible',
          apiKey,
          baseURL: validateBaseURL(baseURL),
        });
      }

      return createOpenAI({ apiKey });

    case 'anthropic':
      return createAnthropic({ apiKey });

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getModel(
  provider: AIProvider,
  modelId: string,
  apiKey: string,
  baseURL?: string
) {
  const aiProvider = createAIProvider(provider, apiKey, baseURL);

  if (provider === 'openai' && baseURL && 'chatModel' in aiProvider) {
    return aiProvider.chatModel(modelId);
  }

  return aiProvider(modelId);
}