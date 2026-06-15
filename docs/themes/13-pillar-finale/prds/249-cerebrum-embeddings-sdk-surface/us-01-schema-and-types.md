# US-01: Promote `cerebrum.embeddings.*` schemas + types to the cerebrum contract package

> PRD: [PRD-249 — `cerebrum.embeddings.*` (read-only) cross-pillar SDK surface](README.md)

## Description

As a downstream PRD-249 US (US-02 router, US-03 consumer flip, US-04 integration test), I want the zod input/output schemas and TypeScript types for the two read-only embeddings procedures (`getStatus`, `listSourceIdsByType`) to live in `@pops/cerebrum-contract` so that both the new cerebrum-api router and the consumer call site agree on the wire format without re-deriving the shapes.

No router code lands in this US — only the shape work and its OpenAPI projection. US-02 mounts the router and binds these schemas to `t.procedure.query(...)`.

## Acceptance Criteria

- [x] Zod schemas live under `packages/cerebrum-contract/src/schemas/embeddings.ts`:
  - [x] `EmbeddingsGetStatusInputSchema` — `{ sourceType?: string (min 1) }`.
  - [x] `EmbeddingsGetStatusOutputSchema` — `{ total: int>=0, pending: int>=0, stale: int>=0 }`. `pending` / `stale` are placeholders held at `0` (mirrors `apps/pops-api/src/modules/core/embeddings/service.ts:128`).
  - [x] `EmbeddingsListSourceIdsByTypeInputSchema` — `{ sourceType: string (min 1) }`.
  - [x] `EmbeddingsListSourceIdsByTypeOutputSchema` — `{ sourceIds: readonly string[] }`.
- [x] TypeScript types live under `packages/cerebrum-contract/src/types/embeddings.ts` (`EmbeddingsGetStatusInput`, `EmbeddingsGetStatusOutput`, `EmbeddingsListSourceIdsByTypeInput`, `EmbeddingsListSourceIdsByTypeOutput`).
- [x] A procedure descriptor (`packages/cerebrum-contract/src/schemas/embeddings-procedures.ts`) pins both procedures to the `query` tRPC method (read-only). The US-02 router implementation MUST register them via `t.procedure.query(...)`, never `t.procedure.mutation(...)`.
- [x] Both modules are exported from the contract's barrels (`src/schemas/index.ts`, `src/types/index.ts`) and reachable via the sub-path exports (`@pops/cerebrum-contract/schemas`, `@pops/cerebrum-contract/types`).
- [x] Round-trip + boundary tests (`packages/cerebrum-contract/src/__tests__/embeddings.test.ts`) cover:
  - [x] `z.infer<...Schema>` matches the hand-written type for each of the four schemas.
  - [x] Input/output schemas accept canonical payloads (incl. empty `sourceType` filter, empty `sourceIds` list, zero counts).
  - [x] Input/output schemas reject malformed payloads (empty string `sourceType`, negative counts, non-integer counts, non-string ids, non-array `sourceIds`).
  - [x] The procedure descriptor pins `method: 'query'` for both procedures and exposes exactly the two procedure keys.
- [x] OpenAPI snapshot (`packages/cerebrum-contract/openapi/cerebrum.openapi.json`) regenerates to include:
  - [x] `GET /cerebrum/embeddings/status` (`operationId: cerebrum.embeddings.getStatus`).
  - [x] `GET /cerebrum/embeddings/source-ids` (`operationId: cerebrum.embeddings.listSourceIdsByType`).
  - [x] `EmbeddingsGetStatusInput`, `EmbeddingsGetStatusOutput`, `EmbeddingsListSourceIdsByTypeInput`, `EmbeddingsListSourceIdsByTypeOutput` under `components.schemas`.
  - [x] No non-`GET` verb on either embeddings path (read-only surface).
- [x] `pnpm --filter @pops/cerebrum-contract typecheck/test/build` pass clean.
- [x] No `as any`, no `as unknown as Type`, no `eslint-disable` / `ts-ignore` / `ts-expect-error`.

## Notes

- The wire shape for `getStatus.pending` / `getStatus.stale` is `0` by design — it preserves today's `service.ts:128` note about per-source tracking being out of scope. A successor PRD wires real counts when a consumer needs them.
- `listSourceIdsByType` is unbounded at this surface. If US-02 / US-03 confirm the table has grown large enough to threaten wire-payload size, a successor PRD adds `{ limit?, cursor? }` pagination. The current schema reserves room for that without breaking the existing shape (the array is `readonly` and additive properties on the output object are non-breaking).
- The contract's `CerebrumRouter` type stays `AnyTRPCRouter` (PRD-153 declaration-bundler gap). The `embeddingsProcedures` descriptor is the contract-level commitment that the router-side implementation honours.
