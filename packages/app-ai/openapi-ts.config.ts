/**
 * Hey API codegen config — projects the core pillar's OpenAPI spec to a
 * typed TS client at `src/core-api/`.
 *
 * Per-consumer client (not a shared SDK): the AI-Ops FE owns its slice of
 * the core surface and stays decoupled. `pillars/core/openapi/core.openapi.json`
 * is the polyglot source of truth; this consumes it into a typed
 * `@hey-api/client-fetch` client.
 *
 * Regenerate: pnpm --filter @pops/app-ai generate:api
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/core/openapi/core.openapi.json',
  output: {
    path: 'src/core-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/core-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
