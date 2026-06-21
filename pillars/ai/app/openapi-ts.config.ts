/**
 * Hey API codegen config — projects the ai pillar's OpenAPI spec to a
 * typed TS client at `src/ai-api/`.
 *
 * Per-consumer client (not a shared SDK): the AI-Ops FE owns its slice of
 * the ai surface and stays decoupled. `pillars/ai/openapi/ai.openapi.json`
 * is the polyglot source of truth; this consumes it into a typed
 * `@hey-api/client-fetch` client.
 *
 * Regenerate: pnpm --filter @pops/app-ai generate:api
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/ai.openapi.json',
  output: {
    path: 'src/ai-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/ai-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
