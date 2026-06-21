/**
 * Hey API codegen config — projects the inventory pillar's OpenAPI spec
 * to a typed TS client at `src/inventory-api/`.
 *
 * Per-consumer client (not a shared SDK): the FE owns its slice of the
 * surface and stays decoupled. `pillars/inventory/openapi/inventory.openapi.json`
 * is the polyglot source of truth; this consumes it into a typed
 * `@hey-api/client-fetch` client.
 *
 * Regenerate: pnpm --filter @pops/app-inventory generate:inventory-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/inventory.openapi.json',
  output: {
    path: 'src/inventory-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/inventory-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
