import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVED_VISIBLE_MS = 2000;
const ERROR_VISIBLE_MS = 5000;

// Tracks storage writes for the "Saving… / Saved" toast. Overlapping saves keep the toast on
// "Saving…" until the last one settles, and the hide timer is reset (and cleared on unmount)
// so an earlier save can't hide a later save's status.
export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const pendingCount = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const showFor = useCallback((next: SaveStatus, ms: number) => {
    clearTimeout(hideTimer.current);
    setStatus(next);
    hideTimer.current = setTimeout(() => setStatus('idle'), ms);
  }, []);

  const track = useCallback(
    async (work: Promise<unknown>) => {
      clearTimeout(hideTimer.current);
      pendingCount.current += 1;
      setStatus('saving');
      try {
        await work;
        pendingCount.current -= 1;
        if (pendingCount.current === 0) showFor('saved', SAVED_VISIBLE_MS);
      } catch (error) {
        pendingCount.current -= 1;
        console.error('Failed to save:', error);
        showFor('error', ERROR_VISIBLE_MS);
      }
    },
    [showFor],
  );

  return { status, track };
}
