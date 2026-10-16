import { useId } from 'react';
import { Keyboard, Zap } from 'lucide-react';
import type { CheckMode } from '@/types';
import { cn } from '@/lib/utils';

const CHECK_MODES = [
  { mode: 'realtime', label: 'Real-time', Icon: Zap },
  { mode: 'ondemand', label: 'On-demand', Icon: Keyboard },
] as const;

export function CheckModePicker({ value, onChange }: { value: CheckMode; onChange: (mode: CheckMode) => void }) {
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
