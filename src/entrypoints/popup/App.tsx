import { useState } from 'react';
import { ExternalLink, PenLine, Settings as SettingsIcon, TriangleAlert } from 'lucide-react';
import type { Settings } from '@/types';
import { PROVIDERS } from '@/types';
import { apiKeysStorage, statsStorage } from '@/lib/storage';
import { useSettings, useStoredValue } from '@/lib/hooks/useStoredValue';
import { GraSpinner } from '@/components/ui/GraSpinner';
import { GraStatsGrid } from '@/components/ui/GraStatsGrid';
import { CheckModePicker } from './components/CheckModePicker';
import { EnableCard } from './components/EnableCard';
import { SetupForm } from './components/SetupForm';

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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30">
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
