import { Power } from 'lucide-react';
import type { Settings } from '@/types';
import { PROVIDER_META } from '@/types';
import { cn } from '@/lib/utils';
import { GraToggle } from '@/components/ui/GraToggle';

export function EnableCard({ settings, onToggle }: { settings: Settings; onToggle: (enabled: boolean) => void }) {
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
