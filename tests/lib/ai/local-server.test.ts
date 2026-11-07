import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_SERVER_PROBE_TIMEOUT_MS, probeLocalServer } from '@/lib/ai/local-server';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('probeLocalServer', () => {
  it('lists the models a reachable server reports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'qwen3:8b' }, { id: 'llama3:8b' }] }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await probeLocalServer('http://localhost:11434/v1')).toEqual({
      reachable: true,
      models: ['qwen3:8b', 'llama3:8b'],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/models');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('reports unreachable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await probeLocalServer('http://localhost:11434/v1')).toEqual({ reachable: false, models: [] });
  });

  it('counts an HTTP error as reachable, so the UI can say the server is up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 403)));
    expect(await probeLocalServer('http://localhost:11434/v1')).toEqual({
      reachable: true,
      models: [],
      error: 'The server answered with HTTP 403.',
    });
  });

  it('survives a body that is not the expected shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 1 }, {}, { id: 'ok' }] })));
    expect(await probeLocalServer('http://localhost:11434/v1')).toEqual({ reachable: true, models: ['ok'] });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null)));
    expect(await probeLocalServer('http://localhost:11434/v1')).toEqual({ reachable: true, models: [] });
  });

  it('never probes an unvalidated URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // Plain http is only allowed on the local machine
    const remote = await probeLocalServer('http://example.com/v1');
    expect(remote.reachable).toBe(false);
    expect(remote.error).toMatch(/must use https/i);

    const credentials = await probeLocalServer('https://user:pw@example.com/v1');
    expect(credentials.error).toMatch(/credentials/i);

    const nonsense = await probeLocalServer('not a url');
    expect(nonsense.error).toMatch(/invalid/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts a hung request so the popup never waits forever', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = probeLocalServer('http://localhost:11434/v1');
    await vi.advanceTimersByTimeAsync(LOCAL_SERVER_PROBE_TIMEOUT_MS);

    expect(await pending).toEqual({ reachable: false, models: [] });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
