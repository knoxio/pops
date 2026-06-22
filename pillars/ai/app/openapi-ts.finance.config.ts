/**
 * Hey API codegen config — projects the FINANCE pillar's OpenAPI spec to a
 * typed TS client at `src/finance-api/`.
 *
 * The AI-Ops FE owns the `/ai-usage/cache*` admin surface, but those
 * cache-maintenance endpoints are served by the FINANCE pillar (the
 * finance-categorizer cache re-homed from core, gap #3489), not the ai
 * pillar. So the cache UI consumes a per-consumer finance client generated
 * from `pillars/finance/openapi/finance.openapi.json` — separate from the
 * `ai-api` client (see `openapi-ts.config.ts`).
 *
 * Regenerate: pnpm --filter @pops/app-ai generate:finance-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../finance/openapi/finance.openapi.json',
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
