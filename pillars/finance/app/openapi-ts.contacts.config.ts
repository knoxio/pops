/**
 * Hey API codegen config — projects the contacts pillar's OpenAPI spec to a
 * typed TS client at `src/contacts-api/`.
 *
 * app-finance is a cross-pillar consumer of contacts, the authoritative
 * entities store (see pillars/contacts/docs/prds/entities): per-consumer
 * client, not a shared SDK — app-finance owns its own slice of the contacts
 * surface via the wire contract.
 *
 * contacts is a Rust pillar with no npm package, so its contract cannot be
 * consumed through a `@pops/*` dependency. Per ADR-033 the OpenAPI snapshot IS
 * the cross-language contract, so this unit vendors a copy under `contracts/`
 * and generates against the local copy. A repo-level drift gate
 * (scripts/ci/check-vendored-contracts.mjs) keeps the copy in lockstep with
 * the canonical `pillars/contacts/openapi/contacts.openapi.json`.
 *
 * Regenerate: pnpm --filter @pops/app-finance generate:contacts-client
 */
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: fileURLToPath(new URL('./contracts/contacts.openapi.json', import.meta.url)),
  output: {
    path: 'src/contacts-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/contacts-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
