import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { settingsStorage, updateSettings, type StorageItem } from '@/lib/storage';
import type { Settings } from '@/types';

interface StoredValue<T> {
  /** undefined until the first read completes */
  value: T | undefined;
  loading: boolean;
  error: unknown;
  setValue: Dispatch<SetStateAction<T | undefined>>;
  reload: () => Promise<void>;
}

// Reads a storage item and keeps it in sync with changes made by any other extension
// context (popup, options page, background), so UI state never goes stale.
export function useStoredValue<T>(item: StorageItem<T>): StoredValue<T> {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setValue(await item.getValue());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [item]);

  useEffect(() => {
    let cancelled = false;
    let changedSinceRead = false;

    // Subscribe before reading so a change landing mid-read isn't missed
    const unwatch = item.watch((next) => {
      changedSinceRead = true;
      if (!cancelled) setValue(next);
    });

    item.getValue().then(
      (initial) => {
        if (!cancelled && !changedSinceRead) setValue(initial);
      },
      (err: unknown) => {
        if (!cancelled) setError(err);
      },
    );

    return () => {
      cancelled = true;
      unwatch();
    };
  }, [item]);

  return { value, loading: value === undefined && !error, error, setValue, reload };
}

// Settings with an optimistic, patch-based updater. The patch is merged into the latest
// stored settings, and the UI rolls back to storage if the write fails.
export function useSettings() {
  const { value, loading, error, setValue, reload } = useStoredValue(settingsStorage);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      setValue((prev) => prev && { ...prev, ...patch });
      try {
        await updateSettings(patch);
      } catch (err) {
        await reload();
        throw err;
      }
    },
    [setValue, reload],
  );

  return { settings: value, loading, error, update, reload };
}
