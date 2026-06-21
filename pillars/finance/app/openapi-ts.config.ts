/**
 * Hey API codegen config — projects the finance pillar's OpenAPI spec
 * to a typed TS client at `src/finance-api/`.
 *
 * Per-consumer client (not a shared SDK): the FE owns its slice of the
 * surface and stays decoupled. `pillars/finance/openapi/finance.openapi.json`
 * is the polyglot source of truth; this consumes it into a typed
 * `@hey-api/client-fetch` client.
 *
 * Regenerate: pnpm --filter @pops/app-finance generate:finance-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/finance.openapi.json',
  output: {
    path: 'src/finance-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/finance-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
