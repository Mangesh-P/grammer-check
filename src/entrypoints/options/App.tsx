import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { BarChart3, Book, CheckCircle2, Key, Save, Settings as SettingsIcon, TriangleAlert } from 'lucide-react';
import type { AIProvider, Settings } from '@/types';
import { apiKeysStorage, dictionaryStorage, removeFromDictionary, setApiKey, statsStorage } from '@/lib/storage';
import { useSettings, useStoredValue } from '@/lib/hooks/useStoredValue';
import { cn } from '@/lib/utils';
import { GraSpinner } from '@/components/ui/GraSpinner';
import { GraStatsGrid } from '@/components/ui/GraStatsGrid';
import { ApiKeysTab } from './tabs/ApiKeysTab';
import { SettingsTab } from './tabs/SettingsTab';
import { DictionaryTab } from './tabs/DictionaryTab';
import { useSaveStatus, type SaveStatus } from './useSaveStatus';

const TABS = [
  { id: 'api-keys', label: 'API Keys', Icon: Key },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  { id: 'dictionary', label: 'Dictionary', Icon: Book },
  { id: 'stats', label: 'Statistics', Icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('api-keys');
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const settingsState = useSettings();
  const apiKeysState = useStoredValue(apiKeysStorage);
  const dictionaryState = useStoredValue(dictionaryStorage);
  const statsState = useStoredValue(statsStorage);
  const { status: saveStatus, track } = useSaveStatus();

  const loadStates = [settingsState, apiKeysState, dictionaryState, statsState];
  const loadError = loadStates.some((s) => s.error);
  const loading = loadStates.some((s) => s.loading);

  const handleSettingsChange = (patch: Partial<Settings>) => void track(settingsState.update(patch));
  const handleSaveKey = (provider: AIProvider, key: string) => void track(setApiKey(provider, key));
  const handleRemoveWord = (word: string) => void track(removeFromDictionary(word));

  function retryLoad() {
    for (const state of loadStates) void state.reload();
  }

  // Arrow/Home/End keys move between tabs (WAI-ARIA tabs pattern, automatic activation)
  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === activeTab);
    const keyToIndex: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const nextIndex = keyToIndex[e.key];
    if (nextIndex === undefined) return;
    e.preventDefault();
    const nextId = TABS[nextIndex].id;
    setActiveTab(nextId);
    tabRefs.current[nextId]?.focus();
  }

  function renderPanel() {
    if (loadError) {
      return (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <TriangleAlert aria-hidden="true" className="h-6 w-6 text-amber-500" />
          <p className="text-sm">Couldn't load your settings.</p>
          <button
            type="button"
            onClick={retryLoad}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Try again
          </button>
        </div>
      );
    }

    const settings = settingsState.settings;
    const apiKeys = apiKeysState.value;
    const dictionary = dictionaryState.value;
    const stats = statsState.value;
    if (loading || !settings || !apiKeys || !dictionary || !stats) {
      return (
        <div className="flex h-full items-center justify-center">
          <GraSpinner />
        </div>
      );
    }

    switch (activeTab) {
      case 'api-keys':
        return <ApiKeysTab apiKeys={apiKeys} onSaveKey={handleSaveKey} />;
      case 'settings':
        return <SettingsTab settings={settings} apiKeys={apiKeys} onChange={handleSettingsChange} />;
      case 'dictionary':
        return <DictionaryTab dictionary={dictionary} onRemoveWord={handleRemoveWord} />;
      case 'stats':
        return <GraStatsGrid stats={stats} />;
    }
  }

  return (
    <div className="bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl p-4">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <div
            role="tablist"
            aria-label="Grammar Check options"
            className="flex overflow-x-auto border-b border-zinc-200 px-2 scrollbar-none dark:border-zinc-800"
          >
            {TABS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  ref={(el) => {
                    tabRefs.current[id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${id}`}
                  aria-selected={active}
                  aria-controls={`panel-${id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setActiveTab(id)}
                  onKeyDown={handleTabKeyDown}
                  className={cn(
                    '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500',
                    active
                      ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200',
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Tab content: fixed height so Chrome's dialog doesn't resize between tabs. Must stay a fixed
              px value — Chrome sizes the dialog to the page, so a vh-based height collapses it. The page
              total (this + ~85px of tabs/padding) must stay under the dialog's ~630px max height. */}
          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA tabs pattern makes a scrollable tabpanel focusable
            tabIndex={0}
            className="h-115 overflow-y-auto p-5 scrollbar-thin focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500"
          >
            {renderPanel()}
          </div>
        </div>

        <SaveToast status={saveStatus} />
      </div>
    </div>
  );
}

// The live region stays mounted so screen readers reliably announce status changes;
// only its contents change.
function SaveToast({ status }: { status: SaveStatus }) {
  return (
    <div role="status" aria-live="polite" className="fixed right-4 bottom-4">
      {status !== 'idle' && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {status === 'saving' && (
            <>
              <Save aria-hidden="true" className="h-4 w-4 animate-pulse text-zinc-400" />
              Saving…
            </>
          )}
          {status === 'saved' && (
            <>
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-500" />
              Saved
            </>
          )}
          {status === 'error' && (
            <>
              <TriangleAlert aria-hidden="true" className="h-4 w-4 text-red-500" />
              Couldn't save. Please try again.
            </>
          )}
        </div>
      )}
    </div>
  );
}
