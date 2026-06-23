/**
 * Hey API codegen config — projects the registry pillar's OpenAPI spec
 * (the pillar formerly named `core`) to a typed TS client at `src/registry-api/`.
 *
 * The shell is a cross-pillar consumer of the registry: the settings
 * renderer, the index redirect, the feature gate and the Features admin page
 * all read/write the registry's `settings.*`, `shell.manifest` and
 * `features.*` surface over REST. Per-consumer client (not a shared SDK): the
 * shell owns its slice of the registry surface via the wire contract.
 * `pillars/registry/openapi/registry.openapi.json` is the source of truth.
 *
 * The generated client posts to the shell's `/registry-api` proxy prefix
 * (see `src/registry-api-runtime-config.ts`), stripped by the generated
 * `/registry-api/` nginx block down to the registry pillar's natural paths.
 *
 * Regenerate: pnpm --filter @pops/shell generate:registry-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/registry/openapi/registry.openapi.json',
  output: {
    path: 'src/registry-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/registry-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
