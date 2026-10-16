import { useState, useTransition } from 'react';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import type { AIProvider } from '@/types';
import { AVAILABLE_MODELS, PROVIDER_META, PROVIDERS } from '@/types';
import { setApiKey, updateSettings } from '@/lib/storage';
import { GraSelect } from '@/components/ui/GraSelect';

const compactInputClass =
  'min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

export function SetupForm({ currentProvider }: { currentProvider: AIProvider }) {
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
