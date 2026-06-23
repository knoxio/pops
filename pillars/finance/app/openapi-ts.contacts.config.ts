/**
 * Hey API codegen config — projects the CONTACTS pillar's OpenAPI spec to a
 * typed TS client at `src/contacts-api/`.
 *
 * app-finance is a cross-pillar consumer of contacts, the authoritative
 * entities store (PRD-163): the entities admin page owns full entity CRUD and
 * the rule/transaction/import entity pickers read the entity list. Per-consumer
 * client (not a shared SDK): app-finance owns its own slice of the contacts
 * surface via the wire contract, decoupled from `@pops/app-ai`.
 *
 * contacts is a Rust pillar with no npm package (it is invisible to pnpm by
 * design — see docs/plans/repo-federation/02-build-system.md), so its contract
 * cannot be consumed through a `@pops/*` dependency. Per ADR-033 the OpenAPI
 * snapshot IS the cross-language contract, so this unit vendors a copy of that
 * published snapshot under `contracts/` and generates against the local copy.
 * No reach into the sibling pillar's folder — finance/app carries its own
 * contract input on extraction. A repo-level drift gate
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
