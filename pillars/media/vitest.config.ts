/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'app/**', 'overlay-ego/**'],
    // Reliability: the many client suites stub `globalThis.fetch` via
    // `vi.stubGlobal`. Auto-restore stubbed globals/mocks after every test,
    // and run test files sequentially, so a fetch stub from one suite can
    // never bleed into a DB-only suite running concurrently (the source of
    // an intermittent cross-file 401 / enrichment flake).
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
    },
  },
});
