# US-02: Mount the read-only `embeddings.*` router on `cerebrumRouter`

> PRD: [PRD-249 — cerebrum.embeddings.\* read-only cross-pillar SDK surface](README.md)
>
> Blocked by: [US-01 — schema + types](us-01-schema-and-types.md).

## Description

As a cross-pillar reader (the consumer of US-03), I want `pops-cerebrum-api` to expose `cerebrum.embeddings.{getStatus, listSourceIdsByType}` with zod-validated inputs / outputs (binding the schemas from US-01) so the typed `pillar<CerebrumRouter>('cerebrum').embeddings.*` proxy resolves to a real wire endpoint.

## Acceptance Criteria

- [ ] `apps/pops-cerebrum-api/src/modules/embeddings/router.ts` exists and mounts:
  - [ ] `getStatus({ sourceType?: string })` → `{ data: { total: number, pending: number, stale: number } }`. Queries the `embeddings` table via `getCerebrumDrizzle()`. Filters by `sourceType` if provided. `pending` and `stale` return 0 (matching today's `service.ts:128` note).
  - [ ] `listSourceIdsByType({ sourceType: string })` → `{ data: { sourceIds: string[] } }`. Executes `selectDistinct({ sourceId: embeddings.sourceId }).from(embeddings).where(eq(embeddings.sourceType, sourceType))`.
- [ ] `apps/pops-cerebrum-api/src/router.ts` mounts `embeddings: embeddingsRouter` under `cerebrumRouter`. Procedure paths are `cerebrum.embeddings.*`.
- [ ] Contract package (`packages/contracts-cerebrum/...`) regenerates and the typed proxy `pillar<CerebrumRouter>('cerebrum').embeddings.{getStatus, listSourceIdsByType}` resolves at the type level.
- [ ] Unit test against the router caller asserts:
  - [ ] `getStatus()` (no `sourceType`) returns the total across all source types.
  - [ ] `getStatus({ sourceType: '<known>' })` returns the filtered count.
  - [ ] `getStatus({ sourceType: '<unknown>' })` returns `{ total: 0, pending: 0, stale: 0 }`.
  - [ ] `listSourceIdsByType({ sourceType: '<known>' })` returns distinct source ids.
  - [ ] `listSourceIdsByType({ sourceType: '<unknown>' })` returns `{ sourceIds: [] }`.
- [ ] `pnpm --filter @pops/pops-cerebrum-api typecheck/test/build` passes clean.
- [ ] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Read-only. No mutations on the `embeddings` table from cross-pillar callers. If a future caller needs to invalidate or re-trigger embedding, that goes through a higher-level workflow procedure, not a cross-pillar write to the table.
- The `pending` / `stale` placeholders preserve today's `service.ts:128` semantics. If a future consumer needs real counts, file a successor PRD.
- The list size in `listSourceIdsByType` is unbounded. If the table is large enough that wire payload becomes a concern, add `{ limit?, cursor? }` pagination. Verify size at PR time (likely <10k; if so, skip pagination).
