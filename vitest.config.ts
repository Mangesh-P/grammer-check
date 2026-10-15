import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Not using wxt/testing's WxtVitest plugin: its auto-import transform breaks coverage source
// maps. The few WXT globals the code relies on are provided in tests/setup.ts instead.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/main.tsx'],
    },
  },
});
