# Embeddings (read surface)

> Status: Done — both read endpoints ship and are covered by unit tests.

Read-only coverage view over cerebrum's `embeddings` metadata table for cross-pillar callers. Writes to `embeddings` belong entirely to cerebrum's internal embedding worker; this surface exposes only the two aggregate reads a peer pillar needs — a total embedded-row count (optionally scoped to a source type) and the distinct source ids recorded for a given source type. Non-identity domain — docker-network trust, no per-request auth.

## Data Model

No new tables. The surface reads the existing `embeddings` table (`pillars/cerebrum/src/db/schema/core/embeddings.ts`), which the embedding worker owns:

- `id` (int, PK, autoincrement)
- `sourceType` (text, NOT NULL) · `sourceId` (text, NOT NULL) · `chunkIndex` (int, default 0)
- `contentHash` (text, NOT NULL) · `contentPreview` (text, NOT NULL)
- `model` (text, NOT NULL) · `dimensions` (int, NOT NULL) · `createdAt` (text, NOT NULL)
- Unique index on `(sourceType, sourceId, chunkIndex)`; indexes on `sourceType` and `contentHash`

## REST API Surface

Contract in `src/contract/rest-embeddings.ts`, mounted at `embeddings` on the cerebrum router. Both procedures are `POST`-with-body (typed inputs preserve parity and avoid query-string round-tripping):

- `POST /embeddings/status` — body `{ sourceType?: string }`. Returns `{ total, pending, stale }`. `total` is `count(*)` over `embeddings`, scoped to `sourceType` when supplied.
- `POST /embeddings/source-ids` — body `{ sourceType: string }` (required, min 1). Returns `{ sourceIds: string[] }` — the distinct `sourceId` values recorded against that source type (`SELECT DISTINCT`, order unspecified).

## Business Rules

- **Read-only.** Neither procedure mutates state. Inserts/updates/deletes on `embeddings` are owned by the cerebrum-internal embedding worker; cross-pillar callers have no write path.
- **`pending` / `stale` are placeholders held at `0`.** Per-source coverage tracking is out of scope for this surface. The fields stay on the wire so a future consumer that needs real counts can be plumbed in without a shape break.
- **`source-ids` is `SELECT DISTINCT`-shaped.** Order is unspecified; callers must not assume sorted output.
- **No knn / semantic-search exposure.** The `vec0` virtual-table path is a separate in-pillar concern (the query engine). This surface reads only the relational `embeddings` table and works even when the `vec` extension is unavailable.

## Edge Cases

| Case                                        | Behaviour                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `status` with an unknown `sourceType`       | Returns `{ total: 0, pending: 0, stale: 0 }`. Not an error.                           |
| `status` over an empty table                | Returns `{ total: 0, pending: 0, stale: 0 }`.                                         |
| `status` with no `sourceType`               | Returns the total across every source type.                                           |
| `source-ids` for a source type with no rows | Returns `{ sourceIds: [] }`.                                                          |
| `vec` extension unavailable                 | Both reads work — they touch only the relational table, not the `vec0` virtual table. |

## Acceptance Criteria

Verified against `src/api/__tests__/embeddings.test.ts`:

- [x] The contract exposes `embeddings.{getStatus, listSourceIdsByType}` with zod-validated inputs/outputs, mounted on the cerebrum router.
- [x] `getStatus` returns zero total on an empty table with `pending` / `stale` held at `0`.
- [x] `getStatus` counts every row when no source type is supplied.
- [x] `getStatus` scopes the count to the requested source type, and returns `{ total: 0, pending: 0, stale: 0 }` for an unknown source type.
- [x] `listSourceIdsByType` returns the distinct source ids for a source type.
- [x] `listSourceIdsByType` returns an empty list for a source type with no rows.

## Out of Scope

- **Cross-pillar embedding writes.** No `insert` / `update` / `delete` on `embeddings` is exposed.
- **`semanticSearch` / knn cross-pillar exposure.** The `vec0`-based path stays in-pillar.
- **Real `pending` / `stale` counts.** Placeholder zeros today; a successor concern when a consumer needs them.
- **Pagination on `source-ids`.** The list is unbounded; add `{ limit?, cursor? }` only if table size makes the wire payload a concern.
