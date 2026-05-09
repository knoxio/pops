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
        '**/*.d.ts',
        'src/test-setup.ts',
        'src/**/*.stories.{ts,tsx}',
      ],
      thresholds: {
        lines: 2,
        functions: 1,
        branches: 1,
        statements: 3,
      },
    },
  },
});
