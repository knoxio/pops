/**
 * Hey API codegen config — projects the cerebrum pillar's OpenAPI spec to a
 * typed TS client at `src/cerebrum-api/`.
 *
 * Per-consumer client (not a shared SDK): the FE owns its slice of the
 * surface and stays decoupled. `pillars/cerebrum/openapi/cerebrum.openapi.json`
 * is the polyglot source of truth; this consumes it into a typed
 * `@hey-api/client-fetch` client.
 *
 * Regenerate: pnpm --filter @pops/app-cerebrum generate:cerebrum-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/cerebrum/openapi/cerebrum.openapi.json',
  output: {
    path: 'src/cerebrum-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/cerebrum-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
