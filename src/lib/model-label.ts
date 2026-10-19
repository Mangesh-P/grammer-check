import { AI_PROVIDER, CUSTOM_MODEL, PROVIDER_META } from '@/types';
import type { Settings } from '@/types';

// Shown as "Checked by <label>" so users with several keys saved can see
// which provider their text actually went to.
export function getModelLabel(settings: Settings): string {
  const model = (settings.model === CUSTOM_MODEL ? settings.customModel : settings.model) || settings.model;

  // A custom endpoint is usually a local model: name the host so it's
  // obvious the text didn't go to OpenAI.
  if (settings.provider === AI_PROVIDER.OPENAI && settings.openAIBaseURL) {
    try {
      return `${model} · ${new URL(settings.openAIBaseURL).hostname}`;
    } catch {
      return model;
    }
  }

  return `${PROVIDER_META[settings.provider].name} · ${model}`;
}
