import type { LocalServerProbe } from '@/types';
import { validateBaseURL } from './base-url';

// A local server that isn't running should fail fast: this runs while the user
// waits in the popup, so a hung socket must not look like a frozen UI.
export const LOCAL_SERVER_PROBE_TIMEOUT_MS = 4000;

interface ModelListResponse {
  data?: { id?: unknown }[];
}

// Every OpenAI-compatible server (Ollama, Open WebUI, LM Studio) exposes
// GET /models, so one unauthenticated request tells us both whether the server
// is up and which models are actually installed.
export async function probeLocalServer(baseURL: string): Promise<LocalServerProbe> {
  let url: string;
  try {
    url = `${validateBaseURL(baseURL)}/models`;
  } catch (error) {
    return { reachable: false, models: [], error: error instanceof Error ? error.message : 'Invalid base URL' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_SERVER_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) {
      // The server is up but refused the request (a blocked origin shows up here
      // only on servers that answer preflight; most look unreachable instead).
      return { reachable: true, models: [], error: `The server answered with HTTP ${response.status}.` };
    }
    const body = (await response.json()) as ModelListResponse;
    const models = Array.isArray(body?.data)
      ? body.data.map((entry) => entry?.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    return { reachable: true, models };
  } catch {
    // Server down, wrong port, or the browser blocked the origin: all
    // indistinguishable from here, and all mean "not usable yet".
    return { reachable: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}
