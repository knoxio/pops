/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
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
        'src/**/*-api/**',
      ],
      // Recalibrated after the AI-entity cache UI (CacheManagementPage +
      // cache-management sections, which carried dedicated tests) moved out
      // with the cache endpoints — those stayed in core (finance-categorizer
      // state), shrinking this app's tested surface. Thresholds track the
      // remaining dashboard's actual coverage.
      thresholds: {
        lines: 57,
        functions: 54,
        branches: 38,
        statements: 55,
      },
    },
  },
});
