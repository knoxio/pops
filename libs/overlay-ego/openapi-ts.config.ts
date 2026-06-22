/**
 * Hey API codegen config — projects the cerebrum pillar's OpenAPI spec to a
 * typed TS client at `src/ego-api/`.
 *
 * The ego surface (`/ego/*`) is served by the cerebrum pillar under the same
 * spec, so overlay-ego consumes that spec into its own client rather than
 * importing app-cerebrum's (which would create a dependency cycle:
 * app-cerebrum already depends on @pops/overlay-ego).
 *
 * Regenerate: pnpm --filter @pops/overlay-ego generate:ego-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/cerebrum.openapi.json',
  output: {
    path: 'src/ego-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/ego-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
