import { useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Info } from 'lucide-react';
import type { AIProvider, APIKeys, ProviderMeta } from '@/types';
import { PROVIDERS } from '@/types';
import { CommitInput } from '../fields';

interface ApiKeysTabProps {
  apiKeys: APIKeys;
  onSaveKey: (provider: AIProvider, key: string) => void;
}

export function ApiKeysTab({ apiKeys, onSaveKey }: ApiKeysTabProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div>
          <h3 className="text-sm font-medium text-indigo-900 dark:text-indigo-200">How to get API keys</h3>
          <p className="mt-1 text-xs leading-relaxed text-indigo-800/80 dark:text-indigo-200/70">
            Add at least one key. Keys stay in this browser and are only sent to the AI provider you choose. Press
            Enter or click away to save.
          </p>
        </div>
      </div>

      {PROVIDERS.map((provider) => (
        <ApiKeyField
          key={provider.id}
          provider={provider}
          savedKey={apiKeys[provider.id] ?? ''}
          onSave={(key) => onSaveKey(provider.id, key)}
        />
      ))}
    </div>
  );
}

function ApiKeyField({
  provider,
  savedKey,
  onSave,
}: {
  provider: ProviderMeta;
  savedKey: string;
  onSave: (key: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const inputId = `key-${provider.id}`;

  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-medium">
          {provider.name}
          {savedKey && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
              <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
              Configured
            </span>
          )}
        </label>
        <a
          href={provider.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Get key
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      </div>
      <div className="relative">
        <CommitInput
          id={inputId}
          type={revealed ? 'text' : 'password'}
          value={savedKey}
          onCommit={onSave}
          placeholder={`Enter your ${provider.name} API key`}
          autoComplete="off"
          spellCheck={false}
          className="pr-10 font-mono"
        />
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          aria-label={revealed ? 'Hide API key' : 'Show API key'}
          aria-controls={inputId}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          {revealed ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
