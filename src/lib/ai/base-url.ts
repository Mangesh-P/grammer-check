const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Only allow HTTPS endpoints, or plain HTTP on the local machine, so the
// API key and user text are never sent unencrypted over the network
export function validateBaseURL(baseURL: string): string {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new Error(`Invalid OpenAI base URL: ${baseURL}`);
  }
  const isLocal = LOCAL_HOSTS.includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('OpenAI base URL must use https:// (plain http:// is only allowed for localhost).');
  }
  if (url.username || url.password) {
    throw new Error('OpenAI base URL must not contain credentials.');
  }
  return url.toString().replace(/\/$/, '');
}
