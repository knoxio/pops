/**
 * Hey API codegen config — projects the CORE pillar's OpenAPI spec to a
 * typed TS client at `src/core-api/`.
 *
 * app-finance is a cross-pillar consumer of core: the entities admin page
 * owns full entity CRUD and the rule/transaction/import entity pickers read
 * the entity list. Per-consumer client (not a shared SDK): app-finance owns
 * its own slice of the core surface via the wire contract, decoupled from
 * `@pops/app-ai`. `pillars/core/openapi/core.openapi.json` is the source of
 * truth.
 *
 * Regenerate: pnpm --filter @pops/app-finance generate:core-client
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
