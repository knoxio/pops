# US-04: End-to-end integration test for `pillar('cerebrum').embeddings.*`

> PRD: [PRD-249 — cerebrum.embeddings.\* read-only cross-pillar SDK surface](README.md)
>
> Blocked by: [US-02 — read router](us-02-embeddings-read-router.md).

## Description

As an operator, I want a single integration test that boots `pops-cerebrum-api` + `pops-api`, exercises both `embeddings.getStatus` and `embeddings.listSourceIdsByType` over the wire from a core-pillar handler, and asserts shape correctness + the unavailable-pillar discriminant.

## Acceptance Criteria

- [x] A test under `apps/pops-api/src/__integration__/` (or the established cross-pillar integration test home) that:
  - [x] Boots `pops-cerebrum-api` (or its in-process router) and the pops-api host registry.
  - [x] Configures `POPS_INTERNAL_API_KEY` via fixture.
  - [x] Seeds the cerebrum `embeddings` table with a known mix of source types (e.g. 3× `entity`, 5× `transaction`).
  - [x] From a core-pillar handler context, calls `pillar('cerebrum').embeddings.getStatus()`, `getStatus({ sourceType: 'entity' })`, and asserts totals match the seeded data.
  - [x] Calls `pillar('cerebrum').embeddings.listSourceIdsByType({ sourceType: 'entity' })` and asserts the distinct source ids returned.
  - [x] Asserts `getStatus({ sourceType: 'unknown' })` returns `{ total: 0, pending: 0, stale: 0 }`.
  - [x] Asserts `listSourceIdsByType({ sourceType: 'unknown' })` returns `{ sourceIds: [] }`.
  - [x] Asserts `pillar('cerebrum').embeddings.getStatus()` throws `PillarCallError` with `kind: 'pillar-unavailable'` when the cerebrum-api endpoint is taken down (or its discovery handle invalidated).
- [x] The test runs as part of the standard `pnpm --filter @pops/pops-api test` pipeline. CI green required for merge.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Tiny surface, tiny test. The integration test is still load-bearing because it proves transport + auth + contract end-to-end for a fresh router mount.
- If PRD-247 US-04 or PRD-248 US-06 already shipped a shared cross-pillar integration-test harness, piggyback on it. Avoid duplicating fixture setup.
- The `pending` / `stale` placeholders are not asserted with non-zero values in this test — they are documented as always 0 per the design.
