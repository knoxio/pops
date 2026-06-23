/**
 * Hey API codegen config — projects the FINANCE pillar's OpenAPI spec to a
 * typed TS client at `src/finance-api/`.
 *
 * The AI-Ops FE owns the `/ai-usage/cache*` admin surface, but those
 * cache-maintenance endpoints are served by the FINANCE pillar (the
 * finance-categorizer cache re-homed from core, gap #3489), not the ai
 * pillar. So the cache UI consumes a per-consumer finance client generated
 * from the finance pillar's published OpenAPI contract, separate from the
 * `ai-api` client (see `openapi-ts.config.ts`).
 *
 * The spec is resolved through `@pops/finance`'s `./openapi` package export (a
 * declared devDependency), never by reaching into the sibling pillar's folder,
 * so this unit stays black-box-isolated and extraction-ready.
 *
 * Regenerate: pnpm --filter @pops/app-ai generate:finance-client
 */
import { createRequire } from 'node:module';

import { defineConfig } from '@hey-api/openapi-ts';

const require = createRequire(import.meta.url);

export default defineConfig({
  input: require.resolve('@pops/finance/openapi'),
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
