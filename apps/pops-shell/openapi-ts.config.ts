/**
 * Hey API codegen config — projects the CORE pillar's OpenAPI spec to a
 * typed TS client at `src/core-api/`.
 *
 * The shell is a cross-pillar consumer of core: the settings renderer,
 * the index redirect, the feature gate and the Features admin page all
 * read/write core's `settings.*`, `shell.manifest` and `features.*`
 * surface over REST. Per-consumer client (not a shared SDK): the shell
 * owns its slice of the core surface via the wire contract.
 * `pillars/core/openapi/core.openapi.json` is the source of truth.
 *
 * Regenerate: pnpm --filter @pops/shell generate:core-client
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
