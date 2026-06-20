# @pops/cerebrum

The collapsed cerebrum pillar — memory / retrieval / autonomous-agent surface
(engrams, retrieval, ingest/emit, plexus, reflex, glia, nudges, and the `ego`
conversational surface). Serves REST from a ts-rest contract; the committed
`openapi/cerebrum.openapi.json` is the wire-typed source for polyglot + FE
consumers.

Layout (mirrors `pillars/inventory`):

- `src/db` — SQLite schema + services + the sqlite-vec loader (`openCerebrumDb`).
- `src/contract` — ts-rest contract (`rest.ts`), zod schemas/types, settings
  manifests, and the generated `manifest.generated.ts` + `api-types.generated.ts`.
- `src/api` — Express container: `/health` + `/pillars` probes and the ts-rest
  endpoints. Port **3007**.

The migration lands domain-by-domain (see
`pillars/cerebrum/docs/runbooks/cerebrum-rest-migration.md`); each slice keeps
`.github/workflows/cerebrum-quality.yml` green. The old `@pops/cerebrum-db` /
`@pops/cerebrum-contract` packages stay in place until their consumers
(pillar-sdk settings, module-registry, the monolith) migrate in Phase C/E.

## Commands

```
pnpm --filter @pops/cerebrum build        # verify-manifest → tsc → openapi → api-types
pnpm --filter @pops/cerebrum typecheck
pnpm --filter @pops/cerebrum test
pnpm --filter @pops/cerebrum generate:openapi
```
