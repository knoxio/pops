/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Force forked child processes per test file so vi.mock factories
    // don't leak across files. Required because multiple test suites
    // mock `@pops/api-client` with different shapes (HeroImageUploader
    // mocks only `food.heroImage`; IngredientsTab mocks `food.ingredients`)
    // and the default worker-thread pool was leaking lazy-import
    // module state across runs.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        'src/**/*.stories.{ts,tsx}',
      ],
    },
  },
});
