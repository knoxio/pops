/**
 * Hey API codegen config — projects the CONTACTS pillar's OpenAPI spec to a
 * typed TS client at `src/contacts-api/`.
 *
 * app-finance is a cross-pillar consumer of contacts, the authoritative
 * entities store (PRD-163): the entities admin page owns full entity CRUD and
 * the rule/transaction/import entity pickers read the entity list. Per-consumer
 * client (not a shared SDK): app-finance owns its own slice of the contacts
 * surface via the wire contract, decoupled from `@pops/app-ai`.
 * `pillars/contacts/openapi/contacts.openapi.json` is the source of truth.
 *
 * Regenerate: pnpm --filter @pops/app-finance generate:contacts-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../contacts/openapi/contacts.openapi.json',
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
