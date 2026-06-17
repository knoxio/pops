/**
 * Hey API codegen config — projects the LISTS pillar's OpenAPI spec to a
 * typed TS client at `src/lists-api/`.
 *
 * app-food is a cross-pillar consumer of lists (the send-to-list modal
 * reads the user's shopping lists). Per-consumer client: app-food owns its
 * own slice of the lists surface via the wire contract, decoupled from
 * `@pops/app-lists`. `pillars/lists/openapi/lists.openapi.json` is the
 * source of truth.
 *
 * Regenerate: pnpm --filter @pops/app-food generate:lists-client
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
