import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// WXT auto-imports these in the extension build. fakeBrowser keeps storage and listeners in memory.
Object.assign(globalThis, {
  browser: fakeBrowser,
  defineBackground: (main: () => void) => ({ main }),
  defineContentScript: <T>(definition: T) => definition,
});

beforeEach(() => {
  fakeBrowser.reset();
  // happy-dom has no execCommand; "unsupported" exercises our fallback paths, and tests
  // that want the native path override the return value
  document.execCommand = vi.fn(() => false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
