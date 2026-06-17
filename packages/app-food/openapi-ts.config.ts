/**
 * Hey API codegen config — projects the food pillar's OpenAPI spec to a
 * typed TS client at `src/food-api/`.
 *
 * Per-consumer client (not a shared SDK): the FE owns its slice of the
 * surface and stays decoupled. `pillars/food/openapi/food.openapi.json`
 * is the polyglot source of truth; this consumes it into a typed
 * `@hey-api/client-fetch` client.
 *
 * Regenerate: pnpm --filter @pops/app-food generate:food-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/food/openapi/food.openapi.json',
  output: {
    path: 'src/food-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/food-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
