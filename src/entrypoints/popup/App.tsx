import { useId, useState, useTransition } from 'react';
import { ExternalLink, Keyboard, PenLine, Power, Settings as SettingsIcon, TriangleAlert, Zap } from 'lucide-react';
import type { AIProvider, CheckMode, Settings } from '@/types';
import { AVAILABLE_MODELS, PROVIDER_META, PROVIDERS } from '@/types';
import { apiKeysStorage, setApiKey, statsStorage, updateSettings } from '@/lib/storage';
import { useSettings, useStoredValue } from '@/lib/hooks/useStoredValue';
import { cn } from '@/lib/utils';
import { GraSelect } from '@/components/ui/GraSelect';
import { GraSpinner } from '@/components/ui/GraSpinner';
import { GraStatsGrid } from '@/components/ui/GraStatsGrid';
import { GraToggle } from '@/components/ui/GraToggle';

const CHECK_MODES = [
  { mode: 'realtime', label: 'Real-time', Icon: Zap },
  { mode: 'ondemand', label: 'On-demand', Icon: Keyboard },
] as const;

const VERSION = browser.runtime.getManifest().version;

export default function App() {
  const { settings, error: settingsError, update, reload } = useSettings();
  const apiKeysState = useStoredValue(apiKeysStorage);
  const statsState = useStoredValue(statsStorage);
  const [actionError, setActionError] = useState<string | null>(null);

  const apiKeys = apiKeysState.value;
  const stats = statsState.value;
  const loadFailed = Boolean(settingsError || apiKeysState.error || statsState.error);

  async function changeSettings(patch: Partial<Settings>) {
    setActionError(null);
    try {
      await update(patch);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setActionError("Couldn't save your change. Please try again.");
    }
  }

  function retryLoad() {
    void reload();
    void apiKeysState.reload();
    void statsState.reload();
  }

  return (
    <div className="w-80 bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30">
            <PenLine aria-hidden="true" className="h-4 w-4 text-white" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight">Grammar Check</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">AI writing assistant</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => browser.runtime.openOptionsPage()}
          className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Settings"
          aria-label="Open settings"
        >
          <SettingsIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      </header>

      <main className="space-y-3 p-4">
        {loadFailed ? (
          // Never render controls on top of defaults: a click would overwrite the user's real settings
          <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
            <TriangleAlert aria-hidden="true" className="h-5 w-5 text-amber-500" />
            <p className="text-sm">Couldn't load your settings.</p>
            <button
              type="button"
              onClick={retryLoad}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Try again
            </button>
          </div>
        ) : !settings || !apiKeys || !stats ? (
          <div className="flex h-32 items-center justify-center">
            <GraSpinner />
          </div>
        ) : (
          <>
            {PROVIDERS.some((p) => apiKeys[p.id]) ? (
              <>
                <EnableCard settings={settings} onToggle={(enabled) => changeSettings({ enabled })} />
                <CheckModePicker value={settings.checkMode} onChange={(checkMode) => changeSettings({ checkMode })} />
              </>
            ) : (
              <SetupForm currentProvider={settings.provider} />
            )}

            {actionError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {actionError}
              </p>
            )}

            <GraStatsGrid stats={stats} variant="compact" />
          </>
        )}
      </main>

      <footer className="flex items-center justify-between border-t border-zinc-200 px-4 py-2.5 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        <span className="tabular-nums">v{VERSION}</span>
        <a
          href="https://github.com/Mangesh-P/grammer-check"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Open source
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      </footer>
    </div>
  );
}

function EnableCard({ settings, onToggle }: { settings: Settings; onToggle: (enabled: boolean) => void }) {
  const { enabled } = settings;

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-inset transition-colors',
            enabled
              ? 'bg-emerald-50 text-emerald-600 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
              : 'bg-zinc-100 text-zinc-400 ring-zinc-500/10 dark:bg-zinc-800 dark:text-zinc-500 dark:ring-zinc-700',
          )}
        >
          <Power aria-hidden="true" className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-medium">{enabled ? 'Checking enabled' : 'Checking paused'}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
              {enabled && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={cn(
                  'relative inline-flex h-1.5 w-1.5 rounded-full',
                  enabled ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600',
                )}
              />
            </span>
            via {PROVIDER_META[settings.provider].name}
          </p>
        </div>
      </div>
      <GraToggle checked={enabled} onChange={onToggle} label="Grammar checking" />
    </div>
  );
}

function CheckModePicker({ value, onChange }: { value: CheckMode; onChange: (mode: CheckMode) => void }) {
  const labelId = useId();

  return (
    <div>
      <p id={labelId} className="mb-1.5 px-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Check mode
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a grid <fieldset> renders inconsistently; role="group" is equivalent */}
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        {CHECK_MODES.map(({ mode, label, Icon }) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => !active && onChange(mode)}
              aria-pressed={active}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-indigo-500',
                active
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
              )}
            >
              <Icon aria-hidden="true" className={cn('h-3.5 w-3.5', active && 'text-indigo-600 dark:text-indigo-400')} />
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 px-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {value === 'realtime' ? (
          'Checks your text as you type.'
        ) : (
          <>
            Press{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-px font-sans text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Ctrl+Shift+G
            </kbd>{' '}
            to check.
          </>
        )}
      </p>
    </div>
  );
}

const compactInputClass =
  'min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

function SetupForm({ currentProvider }: { currentProvider: AIProvider }) {
  const [provider, setProvider] = useState<AIProvider>(currentProvider);
  const [draftKey, setDraftKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const meta = PROVIDER_META[provider];

  // Saves the key and makes its provider active. The popup closes when focus leaves it
  // (e.g. to copy a key), so pasting saves immediately rather than waiting for a click.
  // On success the stored-key watcher swaps this form for the main controls.
  function saveKey(rawKey: string) {
    const key = rawKey.trim();
    if (!key) return;
    setError(null);
    startSaving(async () => {
      try {
        await setApiKey(provider, key);
        if (provider !== currentProvider) {
          await updateSettings({ provider, model: AVAILABLE_MODELS[provider][0].id, customModel: undefined });
        }
        setDraftKey('');
      } catch (err) {
        console.error('Failed to save API key:', err);
        setError("Couldn't save the key. Please try again.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveKey(draftKey);
      }}
      className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10"
    >
      <div className="flex gap-2.5">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="leading-tight">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Connect an AI provider</p>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
            Paste an API key to start checking your writing.
          </p>
        </div>
      </div>
      <GraSelect
        variant="compact"
        value={provider}
        onChange={(e) => setProvider(e.target.value as AIProvider)}
        aria-label="AI provider"
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </GraSelect>
      <div className="flex gap-2">
        <input
          type="password"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            saveKey(e.clipboardData.getData('text'));
          }}
          placeholder={meta.keyPlaceholder}
          aria-label={`${meta.name} API key`}
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          className={compactInputClass}
        />
        <button
          type="submit"
          disabled={saving || !draftKey.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <a
        href={meta.keyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline dark:text-amber-300"
      >
        Get an API key <ExternalLink aria-hidden="true" className="h-3 w-3" />
      </a>
    </form>
  );
}
