import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AI_PROVIDER } from '@/types';
import type { AIProvider } from '@/types';
import { validateBaseURL } from './base-url';

// Hugging Face Inference Providers expose an OpenAI-compatible chat API that routes
// each model ID to whichever provider serves it
const HUGGING_FACE_BASE_URL = 'https://router.huggingface.co/v1';

export function createAIProvider(
  provider: AIProvider,
  apiKey: string,
  baseURL?: string
) {
  switch (provider) {
    case AI_PROVIDER.GOOGLE:
      return createGoogleGenerativeAI({ apiKey });

    case AI_PROVIDER.OPENAI:
      if (baseURL) {
        return createOpenAICompatible({
          name: 'openai-compatible',
          apiKey,
          baseURL: validateBaseURL(baseURL),
        });
      }

      return createOpenAI({ apiKey });

    case AI_PROVIDER.ANTHROPIC:
      return createAnthropic({ apiKey });

    case AI_PROVIDER.HUGGING_FACE:
      return createOpenAICompatible({
        name: AI_PROVIDER.HUGGING_FACE,
        apiKey,
        baseURL: HUGGING_FACE_BASE_URL,
      });

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function isOpenAICompatible(provider: AIProvider, baseURL?: string) {
  return provider === AI_PROVIDER.HUGGING_FACE || (provider === AI_PROVIDER.OPENAI && !!baseURL);
}

// Checks run on every pause in typing, so model "thinking" only adds latency and cost. The native
// SDKs map 'none' to the lightest setting each model accepts; OpenAI-compatible servers (Ollama,
// Hugging Face) would receive it as a raw reasoning_effort field that some reject, so leave theirs alone.
export function getReasoning(provider: AIProvider, baseURL?: string): 'none' | undefined {
  return isOpenAICompatible(provider, baseURL) ? undefined : 'none';
}

export function getModel(
  provider: AIProvider,
  modelId: string,
  apiKey: string,
  baseURL?: string
) {
  const aiProvider = createAIProvider(provider, apiKey, baseURL);

  if (isOpenAICompatible(provider, baseURL) && 'chatModel' in aiProvider) {
    return aiProvider.chatModel(modelId);
  }

  return aiProvider(modelId);
}