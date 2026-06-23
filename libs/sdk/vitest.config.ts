/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Compile the `expectTypeOf` capability/projection assertions so a broken
    // type contract FAILS the run instead of being a runtime no-op. `tsc
    // --noEmit` cannot guard these: libs/sdk's tsconfig excludes test files.
    // Scoped to the capability contract suite — the other `*.test.ts` files are
    // runtime-only and lean on deliberately loose typing.
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.vitest.json',
      include: ['src/capabilities/__tests__/**/*.test.{ts,tsx}'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.{ts,tsx}'],
    },
  },
});
