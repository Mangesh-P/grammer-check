import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const baseClass =
  'block w-full appearance-none bg-white text-zinc-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-100';

const variantClass = {
  default:
    'rounded-md border-0 py-2 pr-9 pl-3 text-sm shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-indigo-500 dark:ring-zinc-700 dark:focus:ring-indigo-500',
  compact:
    'rounded-md border border-zinc-300 py-1.5 pr-8 pl-2.5 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700',
};

interface GraSelectProps extends ComponentProps<'select'> {
  variant?: keyof typeof variantClass;
}

export function GraSelect({ variant = 'default', className, children, ...props }: GraSelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select {...props} className={cn(baseClass, variantClass[variant])}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-400',
          variant === 'compact' ? 'right-2.5 h-3.5 w-3.5' : 'right-3 h-4 w-4',
        )}
      />
    </div>
  );
}
