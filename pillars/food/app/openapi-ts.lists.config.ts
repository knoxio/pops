/**
 * Hey API codegen config — projects the LISTS pillar's OpenAPI spec to a
 * typed TS client at `src/lists-api/`.
 *
 * app-food is a cross-pillar consumer of lists (the send-to-list modal
 * reads the user's shopping lists). Per-consumer client: app-food owns its
 * own slice of the lists surface via the wire contract, decoupled from
 * `@pops/app-lists`.
 *
 * The spec is resolved through `@pops/lists`'s `./openapi` package export (a
 * declared devDependency), never by reaching into the sibling pillar's folder,
 * so this unit stays black-box-isolated and extraction-ready.
 *
 * Regenerate: pnpm --filter @pops/app-food generate:lists-client
 */
import { createRequire } from 'node:module';

import { defineConfig } from '@hey-api/openapi-ts';

const require = createRequire(import.meta.url);

export default defineConfig({
  input: require.resolve('@pops/lists/openapi'),
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
