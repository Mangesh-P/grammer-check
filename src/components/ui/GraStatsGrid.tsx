import type { Stats } from '@/types';
import { cn } from '@/lib/utils';

const STAT_ITEMS: { key: keyof Stats; label: string; shortLabel: string; color: string }[] = [
  { key: 'checksPerformed', label: 'Checks performed', shortLabel: 'Checks', color: 'text-zinc-900 dark:text-zinc-100' },
  { key: 'errorsFound', label: 'Issues found', shortLabel: 'Issues', color: 'text-amber-600 dark:text-amber-400' },
  { key: 'correctionsApplied', label: 'Corrections applied', shortLabel: 'Fixed', color: 'text-emerald-600 dark:text-emerald-400' },
];

interface GraStatsGridProps {
  stats: Stats;
  /** compact: a single divided strip (popup); cards: separate cards (options page) */
  variant?: 'compact' | 'cards';
}

export function GraStatsGrid({ stats, variant = 'cards' }: GraStatsGridProps) {
  const compact = variant === 'compact';

  return (
    <dl
      className={
        compact
          ? 'grid grid-cols-3 divide-x divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800'
          : 'grid grid-cols-1 gap-3 sm:grid-cols-3'
      }
    >
      {STAT_ITEMS.map(({ key, label, shortLabel, color }) => (
        <div
          key={key}
          className={
            compact
              ? 'px-3 py-2.5'
              : 'rounded-lg border border-zinc-200 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/40'
          }
        >
          <dt
            className={cn(
              'font-medium text-zinc-500 dark:text-zinc-400',
              compact ? 'text-[11px] tracking-wide uppercase' : 'text-xs',
            )}
          >
            {compact ? shortLabel : label}
          </dt>
          <dd
            className={cn(
              'font-semibold tracking-tight tabular-nums',
              compact ? 'mt-0.5 text-lg' : 'mt-1 text-2xl',
              color,
            )}
          >
            {stats[key].toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}
