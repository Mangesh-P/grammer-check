import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveStatus } from '@/entrypoints/options/useSaveStatus';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSaveStatus', () => {
  it('shows saving, then saved, then hides', async () => {
    const { result } = renderHook(() => useSaveStatus());
    const work = deferred();
    let tracked!: Promise<void>;
    act(() => {
      tracked = result.current.track(work.promise);
    });
    expect(result.current.status).toBe('saving');

    await act(async () => {
      work.resolve();
      await tracked;
    });
    expect(result.current.status).toBe('saved');

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.status).toBe('idle');
  });

  it('stays on saving until the last overlapping save settles', async () => {
    const { result } = renderHook(() => useSaveStatus());
    const first = deferred();
    const second = deferred();
    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.track(first.promise);
      b = result.current.track(second.promise);
    });
    await act(async () => {
      first.resolve();
      await a;
    });
    expect(result.current.status).toBe('saving');
    await act(async () => {
      second.resolve();
      await b;
    });
    expect(result.current.status).toBe('saved');
  });

  it('shows an error for five seconds', async () => {
    const { result } = renderHook(() => useSaveStatus());
    await act(() => result.current.track(Promise.reject(new Error('x'))));
    expect(result.current.status).toBe('error');
    expect(console.error).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(4999));
    expect(result.current.status).toBe('error');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.status).toBe('idle');
  });

  it('clears the hide timer on unmount', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useSaveStatus());
    await act(() => result.current.track(Promise.resolve()));
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
