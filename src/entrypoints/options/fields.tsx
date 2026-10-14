import { useId, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { hintClass, inputClass, labelClass } from './styles';

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  /** Rendered to the right of the label, e.g. the current value of a slider */
  aside?: ReactNode;
  children: ReactNode;
}

export function Field({ id, label, hint, aside, children }: FieldProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {aside}
      </div>
      <div className="mt-2">{children}</div>
      {hint && (
        <p id={`${id}-hint`} className={hintClass}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface CommitInputProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange'> {
  value: string;
  onCommit: (value: string) => void;
  /** Returns an error message to block the commit, or null when valid */
  validate?: (value: string) => string | null;
}

// A text input that edits a local draft and only commits (trimmed) on Enter or blur, so typing
// doesn't write to browser storage on every keystroke. Escape discards the draft.
export function CommitInput({ value, onCommit, validate, className, onBlur, onKeyDown, ...props }: CommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  function commit() {
    if (draft === null) return;
    const next = draft.trim();
    const validationError = next && validate ? validate(next) : null;
    setError(validationError);
    if (validationError) return;
    setDraft(null);
    if (next !== value) onCommit(next);
  }

  function discard() {
    setDraft(null);
    setError(null);
  }

  return (
    <>
      <input
        {...props}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            discard();
          }
          onKeyDown?.(e);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(props['aria-describedby'], error && errorId) || undefined}
        className={cn(inputClass, className)}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
