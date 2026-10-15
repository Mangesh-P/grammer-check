import { describe, expect, it } from 'vitest';
import { validateBaseURL } from '@/lib/ai/base-url';

describe('validateBaseURL', () => {
  it('accepts https URLs and strips the trailing slash', () => {
    expect(validateBaseURL('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
  });

  it.each(['http://localhost:11434/v1', 'http://127.0.0.1:3000/api', 'http://[::1]:8080'])(
    'allows plain http for the local machine: %s',
    (url) => {
      expect(() => validateBaseURL(url)).not.toThrow();
    },
  );

  it('rejects plain http for remote hosts', () => {
    expect(() => validateBaseURL('http://example.com/v1')).toThrow(/https:\/\//);
  });

  it('rejects other protocols even on localhost', () => {
    expect(() => validateBaseURL('ftp://localhost/v1')).toThrow(/https:\/\//);
  });

  it('rejects embedded credentials', () => {
    expect(() => validateBaseURL('https://user:pass@example.com')).toThrow(/credentials/);
    expect(() => validateBaseURL('https://user@example.com')).toThrow(/credentials/);
  });

  it('rejects unparseable input', () => {
    expect(() => validateBaseURL('not a url')).toThrow(/Invalid OpenAI base URL/);
  });
});
