import { useCallback, useEffect, useState, useTransition } from 'react';
import { CircleCheck, ExternalLink, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AIProvider, LocalServerProbe } from '@/types';
import {
  AI_PROVIDER,
  AVAILABLE_MODELS,
  CUSTOM_MODEL,
  MESSAGE_TYPE,
  OLLAMA_DEFAULT_MODEL,
  PROVIDER_CHOICES,
  PROVIDER_META,
} from '@/types';
import { setApiKey, updateSettings } from '@/lib/storage';
import { GraSelect } from '@/components/ui/GraSelect';
import { GraSpinner } from '@/components/ui/GraSpinner';

const compactInputClass =
  'min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

const primaryButtonClass =
  'rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400';

const linkButtonClass =
  'inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-amber-300';

const OLLAMA_SETUP_URL = 'https://github.com/Mangesh-P/grammer-check#quick-start-local-ai';

/** Probe result plus the URL it was run against, as the background returns it. */
type ProbeState = (LocalServerProbe & { baseURL: string }) | 'checking' | 'failed';

// The server reports what is actually installed, so prefer the recommended model
// when it is there and otherwise fall back to whatever the user already pulled.
// This is what stops "Use local model" from succeeding into a broken setup.
function pickLocalModel(models: string[]): string {
  if (models.includes(OLLAMA_DEFAULT_MODEL)) return OLLAMA_DEFAULT_MODEL;
  return models[0] ?? OLLAMA_DEFAULT_MODEL;
}

// settings.model only accepts a listed id; anything else travels as CUSTOM_MODEL
function localModelPatch(modelId: string) {
  const isListed = AVAILABLE_MODELS[AI_PROVIDER.LOCAL].some((m) => m.id === modelId);
  return isListed ? { model: modelId, customModel: undefined } : { model: CUSTOM_MODEL, customModel: modelId };
}

export function SetupForm({ currentProvider }: { currentProvider: AIProvider }) {
  const [provider, setProvider] = useState<AIProvider>(currentProvider);
  const [draftKey, setDraftKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [probe, setProbe] = useState<ProbeState>('checking');
  const meta = PROVIDER_META[provider];
  const isLocal = provider === AI_PROVIDER.LOCAL;

  const runProbe = useCallback(async () => {
    setProbe('checking');
    try {
      const response = (await browser.runtime.sendMessage({ type: MESSAGE_TYPE.CHECK_LOCAL_SERVER })) as
        | (LocalServerProbe & { success: true; baseURL: string })
        | { success: false; error: string }
        | undefined;
      setProbe(response?.success ? response : 'failed');
    } catch (err) {
      console.error('Failed to check the local server:', err);
      setProbe('failed');
    }
  }, []);

  // Look for the server as soon as the user lands on the local option, so the
  // popup can say whether it is running before they commit to it.
  useEffect(() => {
    if (!isLocal) return;
    void runProbe();
  }, [isLocal, runProbe]);

  // A local model needs no key: choosing it is the whole setup, and the popup then swaps this
  // form for the main controls. Its URL and model can be changed in the options page.
  function connectLocal(modelId: string) {
    setError(null);
    startSaving(async () => {
      try {
        await updateSettings({ provider: AI_PROVIDER.LOCAL, ...localModelPatch(modelId) });
      } catch (err) {
        console.error('Failed to save local model settings:', err);
        setError("Couldn't save the settings. Please try again.");
      }
    });
  }

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

  const ready = isLocal && typeof probe === 'object' && probe.reachable && probe.models.length > 0;
  const chosenModel = typeof probe === 'object' ? pickLocalModel(probe.models) : OLLAMA_DEFAULT_MODEL;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isLocal) connectLocal(chosenModel);
        else saveKey(draftKey);
      }}
      className={`space-y-2.5 rounded-lg border p-3 ${
        ready
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10'
          : 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10'
      }`}
    >
      <div className="flex gap-2.5">
        {ready ? (
          <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        <div className="leading-tight">
          <p
            className={`text-sm font-medium ${
              ready ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
            }`}
          >
            {ready ? 'Local model ready' : 'Connect an AI provider'}
          </p>
          <p
            className={`mt-0.5 text-xs ${
              ready ? 'text-emerald-800/80 dark:text-emerald-200/70' : 'text-amber-800/80 dark:text-amber-200/70'
            }`}
          >
            {!isLocal
              ? 'Paste an API key to start checking your writing.'
              : ready
                ? 'Your own computer will do the checking. Nothing leaves your machine.'
                : 'Run a model on your own computer. No key needed.'}
          </p>
        </div>
      </div>
      <GraSelect
        variant="compact"
        value={provider}
        onChange={(e) => setProvider(e.target.value as AIProvider)}
        aria-label="AI provider"
      >
        {PROVIDER_CHOICES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </GraSelect>
      {isLocal ? (
        <LocalStatus probe={probe} chosenModel={chosenModel} saving={saving} onRecheck={() => void runProbe()} />
      ) : (
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
          <button type="submit" disabled={saving || !draftKey.trim()} className={primaryButtonClass}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {!isLocal && (
        <a href={meta.keyUrl} target="_blank" rel="noopener noreferrer" className={linkButtonClass}>
          Get an API key <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      )}
    </form>
  );
}

function LocalStatus({
  probe,
  chosenModel,
  saving,
  onRecheck,
}: {
  probe: ProbeState;
  chosenModel: string;
  saving: boolean;
  onRecheck: () => void;
}) {
  if (probe === 'checking') {
    return (
      <p aria-live="polite" className="flex items-center gap-2 text-xs text-amber-800/80 dark:text-amber-200/70">
        <GraSpinner /> Looking for a local model server…
      </p>
    );
  }

  const recheck = (
    <button type="button" onClick={onRecheck} className={linkButtonClass}>
      <RefreshCw aria-hidden="true" className="h-3 w-3" /> Check again
    </button>
  );

  // Reached it and it has models: the happy path, nothing left to explain.
  if (probe !== 'failed' && probe.reachable && probe.models.length > 0) {
    const extra = probe.models.length - 1;
    return (
      <div className="space-y-2">
        <p aria-live="polite" className="text-xs text-emerald-800/90 dark:text-emerald-200/80">
          Found a server at <span className="font-mono">{probe.baseURL}</span>. Will use{' '}
          <span className="font-mono font-medium">{chosenModel}</span>
          {extra > 0 && ` (${extra} other model${extra === 1 ? '' : 's'} available)`}.
        </p>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Saving…' : 'Use this model'}
          </button>
          {recheck}
        </div>
      </div>
    );
  }

  // Narrow the union once: 'failed' means the probe itself didn't run.
  const result = probe === 'failed' ? null : probe;
  const baseURL = result?.baseURL ?? null;
  // Up but empty means a server is installed with nothing pulled: a different fix
  // from "not running at all", so say which one it is.
  const serverUp = result?.reachable ?? false;

  return (
    <div className="space-y-2">
      <div aria-live="polite" className="space-y-1 text-xs text-amber-800/90 dark:text-amber-200/80">
        {serverUp ? (
          <>
            <p>
              A server is running at <span className="font-mono">{baseURL}</span>, but it has no models installed.
            </p>
            {result?.error && <p>{result.error}</p>}
            <p>
              In a terminal, run <span className="font-mono">ollama pull {OLLAMA_DEFAULT_MODEL}</span>, then check
              again.
            </p>
          </>
        ) : (
          <>
            <p>
              Couldn't reach a model server
              {baseURL && (
                <>
                  {' '}
                  at <span className="font-mono">{baseURL}</span>
                </>
              )}
              .
            </p>
            <p>Start Ollama and allow the extension to talk to it, then check again.</p>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {recheck}
        <a href={OLLAMA_SETUP_URL} target="_blank" rel="noopener noreferrer" className={linkButtonClass}>
          Setup guide <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </a>
      </div>
      <button type="submit" disabled={saving} className={primaryButtonClass}>
        {saving ? 'Saving…' : 'Use it anyway'}
      </button>
    </div>
  );
}
