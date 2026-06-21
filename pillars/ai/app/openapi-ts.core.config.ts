/**
 * Hey API codegen config — projects the CORE pillar's OpenAPI spec to a
 * typed TS client at `src/core-api/`.
 *
 * The AI-Ops FE owns the `/ai-usage/cache*` admin surface, but those
 * cache-maintenance endpoints are served by the CORE pillar (the finance
 * categorizer cache stays in core until a later finance re-home), not the
 * ai pillar. So the cache UI consumes a per-consumer core client generated
 * from `pillars/core/openapi/core.openapi.json` — separate from the
 * `ai-api` client (see `openapi-ts.config.ts`).
 *
 * Regenerate: pnpm --filter @pops/app-ai generate:core-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../core/openapi/core.openapi.json',
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
