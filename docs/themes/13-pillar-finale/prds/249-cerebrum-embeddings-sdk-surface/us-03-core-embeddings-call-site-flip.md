# US-03: Flip `core/embeddings/service.ts` from `@pops/cerebrum-db` to `pillar('cerebrum').embeddings.*`

> PRD: [PRD-249 — cerebrum.embeddings.\* read-only cross-pillar SDK surface](README.md)
>
> Blocked by: [US-02 — read router](us-02-embeddings-read-router.md).

## Description

As an `apps/pops-api` core-pillar maintainer, I want `core/embeddings/service.ts` flipped from its direct `@pops/cerebrum-db` `embeddings` table reads to the typed `pillar('cerebrum').embeddings.*` SDK calls so the H8 violation entry for this file drops from `.dependency-cruiser-known-violations.json`. Jointly with PRD-249 US-01 + US-02 (the schemas and the router) this US closes [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 1.

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/core/embeddings/service.ts`:
  - [ ] `getEmbeddingStatus(sourceType?)` becomes `async`. Its body calls `await pillar('cerebrum').embeddings.getStatus({ sourceType })` and returns the unwrapped `data`.
  - [ ] `reindexEmbeddings(sourceType, sourceIds?)`'s `else` branch (the `selectDistinct` path) becomes `const { sourceIds: ids } = (await pillar('cerebrum').embeddings.listSourceIdsByType({ sourceType })).data`.
  - [ ] The runtime `import { embeddings } from '@pops/cerebrum-db'` is removed.
  - [ ] Type-only imports of any shared enum (e.g. embedding source type names) remain allowed.
- [ ] All callers of `getEmbeddingStatus` are updated to `await` the now-async function. `grep -rn "getEmbeddingStatus(" apps/pops-api/src/` before merging.
- [ ] The matching `.dependency-cruiser-known-violations.json` entry (the `core/embeddings/service.ts` → `@pops/cerebrum-db` allow) is removed.
- [ ] Existing unit tests under `apps/pops-api/src/modules/core/embeddings/` are updated:
  - [ ] Mocks flip from mocking `@pops/cerebrum-db`'s drizzle to mocking the SDK module (per [server-pillar-sdk-consumer-pattern](../../notes/server-pillar-sdk-consumer-pattern.md)).
  - [ ] `getEmbeddingStatus` test surface remains: total returned for each sourceType filter; placeholder pending/stale at 0.
- [ ] `pnpm --filter @pops/pops-api typecheck/test/build` passes clean.
- [ ] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This is the smallest of the three sibling burn-down USs (one file, two methods). It's the lowest-risk first flip after PRD-247 US-01 establishes the conventions.
- `reindexEmbeddings`'s for-loop over the source ids continues to enqueue via `embedContent({ sourceType, sourceId })` — that part stays in-pillar (it's a worker enqueue, not a cerebrum-db read).
- The `semanticSearch` function on line 92 of the same file is **not** part of this US. Its `runKnnQuery` uses the `vec0` virtual table, not the drizzle `embeddings` import, and its scope is explicitly out of PRD-249.
- After this US lands, [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Site 1 closes. Update PRD-246's tracking table in the same PR (or referenced commit).
