# Idea: Vector Storage — deferred pieces

Captures the parts of the vector-storage spec that the original PRD/user-stories marked as done but that the shipped cerebrum implementation does not have. The built core lives in [PRD: Vector Storage](../themes/00-platform/prds/vector-storage/README.md).

## 1. Redis embedding caches

The original spec claimed two Redis caches; neither exists.

- **Query-embedding cache** — cache identical search queries' vectors with a TTL so a repeated query within a session doesn't re-hit the embedding API. Today `embedQuery` calls the provider on every search.
- **Content-hash → vector cache** — cache `content_hash → vector` so re-embedding identical chunk text across sources avoids a redundant API call. Today dedup is metadata-only (skip if the same source/chunk has an unchanged hash); identical text under a different source still re-embeds.

Worth it only if the embedding API cost or latency becomes a real constraint. The hash-level dedup already covers the common "content unchanged" case.

## 2. `ai_usage` cost tracking for embeddings

The embedding worker's usage write is an explicit no-op — the cerebrum pillar has no shared `pops.db` and no `ai_usage` table (the registry dropped `ai_usage` in migration `0070`; finance owns its own copy for finance-domain usage). To track embedding model/token/cost spend, the pillar would need either its own usage table or a cross-pillar usage sink.

## 3. Orphan cleanup as a scheduled job

The shipped pipeline prunes orphan chunks **inline** per embedding job (chunks beyond the new chunk count, and all chunks when content empties). There is no periodic repeatable BullMQ job that sweeps embeddings whose entire source record was deleted out-of-band (a source row removed in a peer pillar without an embedding job firing). A `cleanupOrphanedEmbeddings()` repeatable job would close that gap.

## 4. Arbitrary-id reindex procedure

The original `reindex(sourceType, sourceIds?)` → `{ enqueued }` shape does not exist. The pillar offers:

- `cerebrum.index.reindex-sources` — scans whole peer source **types** and enqueues changed rows.
- `cerebrum.index.reindex` — rebuilds the engram index from disk (`force` re-enqueues embeddings).

A targeted "re-embed exactly these source ids" procedure would need to be added if a caller wants per-id control rather than per-type scans.

## 5. Real `pending` / `stale` coverage counts

`cerebrum.embeddings.status` returns `total` truthfully but holds `pending` and `stale` at `0` — per-source freshness tracking (how many sources are unembedded or have a stale hash relative to the live source) is not computed. Wire real counts when a consumer needs coverage telemetry.
