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
      thresholds: {
        lines: 60,
        functions: 55,
        branches: 60,
        statements: 58,
      },
    },
  },
});
