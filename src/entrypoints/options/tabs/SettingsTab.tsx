import { useState } from 'react';
import { Keyboard, TriangleAlert, Zap } from 'lucide-react';
import type { APIKeys, Settings } from '@/types';
import { AI_PROVIDER, AVAILABLE_MODELS, CUSTOM_MODEL, PROVIDER_META, PROVIDERS, SUPPORTED_LANGUAGES, TRANSLATE_LANGUAGES } from '@/types';
import { validateBaseURL } from '@/lib/ai/base-url';
import { cn } from '@/lib/utils';
import { GraSelect } from '@/components/ui/GraSelect';
import { GraToggle } from '@/components/ui/GraToggle';
import { CommitInput, Field } from '../fields';
import { hintClass, labelClass, sectionHeadingClass } from '../styles';

const CHECK_MODES = [
  { mode: 'realtime', title: 'Real-time', desc: 'Check as you type', Icon: Zap },
  { mode: 'ondemand', title: 'On-demand', desc: 'Ctrl/Cmd + Shift + G', Icon: Keyboard },
] as const;

const MIN_DELAY = 200;
const MAX_DELAY = 2000;

function baseURLError(value: string): string | null {
  try {
    validateBaseURL(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid URL';
  }
}

interface SettingsTabProps {
  settings: Settings;
  apiKeys: APIKeys;
  onChange: (patch: Partial<Settings>) => void;
}

export function SettingsTab({ settings, apiKeys, onChange }: SettingsTabProps) {
  const hasAnyKey = PROVIDERS.some((p) => apiKeys[p.id]);

  return (
    <div className="space-y-6">
      {!hasAnyKey && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Please add at least one API key in the "API Keys" tab to use Grammar Check.
          </p>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div>
          <p className={labelClass}>Enable Grammar Check</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            When disabled, Grammar Check won't check any text fields.
          </p>
        </div>
        <GraToggle checked={settings.enabled} onChange={(enabled) => onChange({ enabled })} label="Enable Grammar Check" />
      </div>

      <section className="space-y-5" aria-labelledby="section-model">
        <h2 id="section-model" className={sectionHeadingClass}>
          AI model
        </h2>

        <Field id="provider" label="AI Provider">
          <GraSelect
            id="provider"
            value={settings.provider}
            onChange={(e) => {
              const provider = e.target.value as Settings['provider'];
              onChange({ provider, model: AVAILABLE_MODELS[provider][0].id, customModel: undefined });
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={!apiKeys[p.id]}>
                {p.name}
                {!apiKeys[p.id] && ' (no API key)'}
              </option>
            ))}
          </GraSelect>
        </Field>

        {settings.provider === AI_PROVIDER.OPENAI && (
          <Field
            id="base-url"
            label="OpenAI-compatible Base URL"
            hint="Optional. Use a custom OpenAI-compatible endpoint such as Open WebUI, Ollama, LM Studio, or LocalAI."
          >
            <CommitInput
              id="base-url"
              type="url"
              value={settings.openAIBaseURL ?? ''}
              onCommit={(openAIBaseURL) => onChange({ openAIBaseURL })}
              validate={baseURLError}
              placeholder="Leave empty for OpenAI, or use http://localhost:3000/api"
              aria-describedby="base-url-hint"
            />
          </Field>
        )}

        <Field id="model" label="Model">
          <GraSelect
            id="model"
            value={settings.model}
            onChange={(e) => {
              const model = e.target.value;
              onChange(model === CUSTOM_MODEL ? { model } : { model, customModel: undefined });
            }}
          >
            {AVAILABLE_MODELS[settings.provider].map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
            <option value={CUSTOM_MODEL}>Use custom model…</option>
          </GraSelect>
        </Field>

        {settings.model === CUSTOM_MODEL && (
          <Field
            id="custom-model"
            label="Custom Model ID"
            hint={`Enter the exact model ID from ${PROVIDER_META[settings.provider].name}`}
          >
            <CommitInput
              id="custom-model"
              value={settings.customModel ?? ''}
              onCommit={(customModel) => onChange({ customModel })}
              placeholder="e.g., qwen3:8b"
              aria-describedby="custom-model-hint"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
        )}
      </section>

      <div className="border-t border-zinc-200 dark:border-zinc-800" />

      <section className="space-y-5" aria-labelledby="section-checking">
        <h2 id="section-checking" className={sectionHeadingClass}>
          Checking
        </h2>

        <fieldset>
          <legend className={labelClass}>Check Mode</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CHECK_MODES.map(({ mode, title, desc, Icon }) => {
              const active = settings.checkMode === mode;
              return (
                <label
                  key={mode}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg p-3 ring-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-indigo-500',
                    active
                      ? 'bg-indigo-50 ring-2 ring-indigo-600 dark:bg-indigo-500/10 dark:ring-indigo-500'
                      : 'ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-800 dark:hover:bg-zinc-800/50',
                  )}
                >
                  <input
                    type="radio"
                    name="check-mode"
                    value={mode}
                    checked={active}
                    onChange={() => onChange({ checkMode: mode })}
                    className="sr-only"
                  />
                  <Icon
                    aria-hidden="true"
                    className={cn('h-4 w-4 shrink-0', active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400')}
                  />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{desc}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {settings.checkMode === 'realtime' && (
          <DelaySlider value={settings.realtimeDelay} onCommit={(realtimeDelay) => onChange({ realtimeDelay })} />
        )}

        <Field id="language" label="Language">
          <GraSelect id="language" value={settings.language} onChange={(e) => onChange({ language: e.target.value })}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </GraSelect>
        </Field>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={labelClass}>Rewrite menu</p>
            <p className={cn(hintClass, 'mt-1')}>
              Select a few words in a text field to Formalize, make Friendly, Shorten, Proofread, or Translate them.
              Text is only sent to the AI when you pick an option.
            </p>
          </div>
          <GraToggle
            checked={settings.rewriteMenu}
            onChange={(rewriteMenu) => onChange({ rewriteMenu })}
            label="Rewrite menu"
          />
        </div>

        {settings.rewriteMenu && (
          <Field id="translate-to" label="Translate to" hint="Listed first in the rewrite menu's Translate list.">
            <GraSelect
              id="translate-to"
              value={settings.translateTo}
              onChange={(e) => onChange({ translateTo: e.target.value })}
              aria-describedby="translate-to-hint"
            >
              {TRANSLATE_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </GraSelect>
          </Field>
        )}
      </section>
    </div>
  );
}

// Tracks the value locally while dragging and saves once the drag/keypress ends,
// instead of writing to storage on every intermediate step
function DelaySlider({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;

  function commit() {
    if (draft === null) return;
    setDraft(null);
    if (draft !== value) onCommit(draft);
  }

  return (
    <Field
      id="realtime-delay"
      label="Delay before checking"
      aside={
        <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700 tabular-nums dark:bg-zinc-800 dark:text-zinc-300">
          {shown}ms
        </span>
      }
    >
      <input
        id="realtime-delay"
        type="range"
        min={MIN_DELAY}
        max={MAX_DELAY}
        step={100}
        value={shown}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-valuetext={`${shown} milliseconds`}
        className="w-full cursor-pointer accent-indigo-600 dark:accent-indigo-500"
      />
      <div className={cn(hintClass, 'mt-1 flex justify-between')} aria-hidden="true">
        <span>{MIN_DELAY}ms (faster)</span>
        <span>{MAX_DELAY}ms (fewer API calls)</span>
      </div>
    </Field>
  );
}
