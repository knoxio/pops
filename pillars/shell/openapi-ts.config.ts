/**
 * Hey API codegen config — projects the registry pillar's OpenAPI spec
 * (the pillar formerly named `core`) to a typed TS client at `src/core-api/`.
 *
 * The shell is a cross-pillar consumer of the registry: the settings
 * renderer, the index redirect, the feature gate and the Features admin page
 * all read/write the registry's `settings.*`, `shell.manifest` and
 * `features.*` surface over REST. Per-consumer client (not a shared SDK): the
 * shell owns its slice of the registry surface via the wire contract.
 * `pillars/registry/openapi/registry.openapi.json` is the source of truth.
 *
 * The generated client dir (`src/core-api/`) and its `/core-api` proxy prefix
 * keep their legacy names for now — the browser-facing `/core-api`→
 * `/registry-api` cutover is a later, deploy-observed step backed by the
 * transitional `/core-api/` nginx block. Only the spec input moved here.
 *
 * Regenerate: pnpm --filter @pops/shell generate:core-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/registry/openapi/registry.openapi.json',
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
