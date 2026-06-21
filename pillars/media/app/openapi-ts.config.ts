/**
 * Hey API codegen config — projects the media pillar's OpenAPI spec to a
 * typed TS client at `src/media-api/`.
 *
 * Per-consumer client (not a shared SDK): the FE owns its slice of the
 * surface and stays decoupled. `pillars/media/openapi/media.openapi.json`
 * is the polyglot source of truth; this consumes it into a typed
 * `@hey-api/client-fetch` client.
 *
 * Regenerate: pnpm --filter @pops/app-media generate:media-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/media.openapi.json',
  output: {
    path: 'src/media-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/media-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
