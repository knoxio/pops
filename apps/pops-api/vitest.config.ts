import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.integration.test.ts',
        'src/cli/**',
        'src/scripts/**',
        'scripts/**',
      ],
      thresholds: {
        lines: 74,
        functions: 73,
        branches: 64,
        statements: 73,
      },
    },
  },
});
