import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSettings, useStoredValue } from '@/lib/hooks/useStoredValue';
import { settingsStorage, type StorageItem } from '@/lib/storage';
import { DEFAULT_SETTINGS } from '@/types';

function fakeItem<T>(getValue: () => Promise<T>) {
  let listener: ((value: T) => void) | undefined;
  const unwatch = vi.fn();
  const item: StorageItem<T> = {
    getValue: vi.fn(getValue),
    setValue: vi.fn(async () => {}),
    watch: vi.fn((cb) => {
      listener = cb;
      return unwatch;
    }),
  };
  return { item, unwatch, emit: (value: T) => listener?.(value) };
}

describe('useStoredValue', () => {
  it('loads the value and reports loading until then', async () => {
    const { item } = fakeItem(async () => 'stored');
    const { result } = renderHook(() => useStoredValue(item));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.value).toBe('stored'));
    expect(result.current.loading).toBe(false);
  });

  it('follows changes from other contexts and unsubscribes on unmount', async () => {
    const { item, emit, unwatch } = fakeItem(async () => 'a');
    const { result, unmount } = renderHook(() => useStoredValue(item));
    await waitFor(() => expect(result.current.value).toBe('a'));
    act(() => emit('b'));
    expect(result.current.value).toBe('b');
    unmount();
    expect(unwatch).toHaveBeenCalled();
  });

  it('does not let a slow initial read overwrite a newer change', async () => {
    let resolveRead!: (v: string) => void;
    const { item, emit } = fakeItem(() => new Promise<string>((r) => (resolveRead = r)));
    const { result } = renderHook(() => useStoredValue(item));
    act(() => emit('newer'));
    await act(async () => resolveRead('stale'));
    expect(result.current.value).toBe('newer');
  });

  it('reports load errors and recovers on reload', async () => {
    const error = new Error('nope');
    const getValue = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');
    const { item } = fakeItem(getValue);
    const { result } = renderHook(() => useStoredValue(item));
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(result.current.loading).toBe(false);

    await act(() => result.current.reload());
    expect(result.current.value).toBe('ok');
    expect(result.current.error).toBeNull();
  });

  it('keeps the error when reload fails again', async () => {
    const { item } = fakeItem(() => Promise.reject(new Error('x')));
    const { result } = renderHook(() => useStoredValue(item));
    await act(() => result.current.reload());
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('ignores results that land after unmount', async () => {
    let rejectRead!: (e: unknown) => void;
    const { item } = fakeItem(() => new Promise<string>((_, r) => (rejectRead = r)));
    const { result, unmount } = renderHook(() => useStoredValue(item));
    unmount();
    await act(async () => rejectRead(new Error('late')));
    expect(result.current.error).toBeNull();
  });
});

describe('useSettings', () => {
  it('updates optimistically and persists a patch', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings).toEqual(DEFAULT_SETTINGS));
    await act(() => result.current.update({ enabled: false }));
    expect(result.current.settings?.enabled).toBe(false);
    expect((await settingsStorage.getValue()).enabled).toBe(false);
  });

  it('rolls back to storage and rethrows when the write fails', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings).toBeDefined());
    vi.spyOn(settingsStorage, 'setValue').mockRejectedValueOnce(new Error('quota'));

    await act(async () => {
      await expect(result.current.update({ enabled: false })).rejects.toThrow('quota');
    });
    expect(result.current.settings?.enabled).toBe(true);
  });
});
