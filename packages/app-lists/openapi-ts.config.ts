/**
 * Hey API codegen config — projects the lists pillar's OpenAPI spec to a
 * typed TS client at `src/lists-api/`.
 *
 * Why a per-consumer client (rather than a shared SDK): each FE consumer
 * owns its own slice of the surface and stays decoupled from siblings.
 * `pillars/lists/openapi/lists.openapi.json` is the polyglot-friendly
 * source of truth; this config consumes it into a typed `@hey-api/client-fetch`
 * client.
 *
 * Drift check (TODO: add to CI):
 *   pnpm --filter @pops/app-lists generate:lists-client
 *   git diff --exit-code packages/app-lists/src/lists-api
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/lists/openapi/lists.openapi.json',
  output: {
    path: 'src/lists-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/lists-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
