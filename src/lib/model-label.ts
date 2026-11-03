import { AI_PROVIDER, CUSTOM_MODEL, PROVIDER_META } from '@/types';
import type { Settings } from '@/types';

// Shown as "Checked by <label>" so users with several keys saved can see
// which provider their text actually went to.
export function getModelLabel(settings: Settings): string {
  const model = (settings.model === CUSTOM_MODEL ? settings.customModel : settings.model) || settings.model;

  // Name the host so it's obvious where the text went (usually this machine).
  if (settings.provider === AI_PROVIDER.LOCAL && settings.localBaseURL) {
    try {
      return `${model} · ${new URL(settings.localBaseURL).hostname}`;
    } catch {
      return model;
    }
  }

  return `${PROVIDER_META[settings.provider].name} · ${model}`;
}
