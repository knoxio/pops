/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'app/**', 'overlay-ego/**'],
    // Auto-restore vi.stubGlobal'd globals (e.g. `fetch`) after every test so a
    // stub from one file can't leak into another file running in parallel —
    // the source of intermittent ai-providers/ai-alerts health-check failures.
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
    },
  },
});
