import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't load the PWA and HTTPS preview plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
  },
});
