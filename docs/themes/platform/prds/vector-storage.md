# PRD: Vector Storage

> Theme: [Platform](../README.md)
> Status: Done
> Owner pillar: `cerebrum`

## Overview

The cerebrum pillar stores dense-vector embeddings alongside its relational data in its own SQLite database (`cerebrum.db`) using the `sqlite-vec` runtime extension, and exposes semantic similarity search over that index. Three pieces make this work:

1. **Storage** — an `embeddings` metadata table plus a `embeddings_vec` sqlite-vec virtual table holding the actual vectors, both owned by cerebrum.
2. **Search** — a semantic (k-NN) search service fused with a structured/BM25 leg into a hybrid retrieval surface, served over REST as `cerebrum.retrieval.*`.
3. **Pipeline** — a background BullMQ worker (`pops-embeddings` queue) that chunks content, embeds the changed chunks via a remote API, and writes vectors into the index.

Vector features degrade gracefully: if `sqlite-vec` fails to load, or no embedding API key is configured, non-vector cerebrum features (engram CRUD, scopes, tags, links, structured/BM25 retrieval) keep working and semantic search returns no results rather than crashing.

## Data Model

Both tables live in `cerebrum.db`, owned by the cerebrum pillar. No shared `pops.db`, no cross-database vector queries.

### `embeddings` (metadata)

| Column            | Type    | Constraints         | Description                                                            |
| ----------------- | ------- | ------------------- | ---------------------------------------------------------------------- |
| `id`              | INTEGER | PK, autoincrement   | Embedding record ID; equals `embeddings_vec.rowid`                     |
| `source_type`     | TEXT    | NOT NULL            | Source kind (`engram`, `transaction`, `movie`, `tv_show`, `inventory`) |
| `source_id`       | TEXT    | NOT NULL            | ID of the source record                                                |
| `chunk_index`     | INTEGER | NOT NULL, default 0 | Index within multi-chunk content (0 for single-chunk)                  |
| `content_hash`    | TEXT    | NOT NULL            | SHA-256 of the embedded chunk text — skip re-embedding if unchanged    |
| `content_preview` | TEXT    | NOT NULL            | First 200 chars of the chunk text                                      |
| `model`           | TEXT    | NOT NULL            | Model used to generate the embedding                                   |
| `dimensions`      | INTEGER | NOT NULL            | Vector dimensionality (1536 for `text-embedding-3-small`)              |
| `created_at`      | TEXT    | NOT NULL, ISO 8601  | When the embedding was generated                                       |

**Indexes:**

- Unique on `(source_type, source_id, chunk_index)` — one embedding per chunk per source
- Index on `source_type` for filtered search and coverage stats
- Index on `content_hash` for deduplication

Created by the Drizzle migration `0054_embeddings_baseline.sql` (written by hand — virtual tables and the baseline shape are out of `drizzle-kit generate`'s reach).

### `embeddings_vec` (sqlite-vec virtual table)

| Column   | Type        | Description                                                    |
| -------- | ----------- | -------------------------------------------------------------- |
| `rowid`  | INTEGER     | Matches `embeddings.id` (enforced by application code, not FK) |
| `vector` | FLOAT[1536] | The embedding vector                                           |

Created imperatively as `CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_vec USING vec0(vector float[1536])` after the extension loads — **not** in the migration journal, because virtual tables aren't representable in the Drizzle schema builder and the metadata baseline must still apply on builds where `sqlite-vec` is unavailable. The dimension is fixed at 1536; changing the model's dimensionality requires a full re-embed (see Edge Cases).

`embeddings_vec.rowid == embeddings.id` is maintained by the writer (insert metadata row → use its `id` as the vector `rowid`). Virtual tables don't support foreign keys, so this invariant is code-enforced.

## REST Surface

All routes are POST-with-body unless noted (typed filter objects / arrays don't round-trip cleanly through query strings). Stateless, non-identity domain — served on the docker-network trust boundary, no per-request auth. Filtering rides in the request body, never derived from a caller identity.

### `cerebrum.retrieval.*` — read surface (`rest-retrieval.ts`)

| Route                     | Body                                                                                                                                                      | Response                                                | Notes                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `POST /retrieval/search`  | `query?`, `mode` (`semantic`\|`structured`\|`hybrid`, default `hybrid`), `filters?`, `limit` (≤100, default 20), `threshold` (0–2, default 0.8), `offset` | `{ results: RetrievalResult[], meta: { total, mode } }` | Unified search                                                             |
| `POST /retrieval/context` | `query`, `filters?`, `tokenBudget` (default 4096), `includeMetadata`, `maxResults`                                                                        | `{ context, sources, truncated, tokenEstimate }`        | Token-budgeted LLM context window                                          |
| `POST /retrieval/similar` | `engramId`, `limit`, `threshold`, `filters?`                                                                                                              | `{ results: RetrievalResult[] }`                        | Engrams similar to a given engram by its stored vector — no embedding call |
| `GET /retrieval/stats`    | —                                                                                                                                                         | `{ indexed, embedded, sourceTypes, lastUpdated }`       | Retrieval health + coverage                                                |

`RetrievalResult`: `{ sourceType, sourceId, title, contentPreview, score, distance, matchType, metadata }` where `matchType ∈ { semantic, structured, both }`. `score` is RRF-fused for hybrid, and `max(0, 1 - distance)` for a pure semantic result.

### `cerebrum.embeddings.*` — coverage surface (`rest-embeddings.ts`)

| Route                         | Body          | Response                    | Notes                                                                   |
| ----------------------------- | ------------- | --------------------------- | ----------------------------------------------------------------------- |
| `POST /embeddings/status`     | `sourceType?` | `{ total, pending, stale }` | Coverage stats; `pending`/`stale` are reserved placeholders held at `0` |
| `POST /embeddings/source-ids` | `sourceType`  | `{ sourceIds: string[] }`   | Distinct source ids for a source type (order unspecified)               |

### `cerebrum.index.*` — maintenance surface (`rest-index.ts`)

| Route                         | Body           | Response                                               | Notes                                                               |
| ----------------------------- | -------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `GET /index/status`           | —              | `{ watcher, embeddingsQueue: { name, pendingCount } }` | Watcher health + queue depth                                        |
| `POST /index/reindex`         | `force?`       | `{ indexed, enqueued }`                                | Rebuild engram index from disk; `force` re-enqueues embeddings      |
| `POST /index/reindex-sources` | `sourceTypes?` | `{ enqueued, sourceTypes }`                            | Scan peer pillars, enqueue embeddings for changed cross-source rows |
| `POST /index/reconcile`       | `dryRun?`      | `{ missing, orphaned, dryRun }`                        | Diff disk against index; apply unless `dryRun`                      |

## How It Works

### Extension loading (boot)

`openCerebrumDb(path)` opens the SQLite handle, sets `journal_mode=WAL` / `foreign_keys=ON` / `busy_timeout=5000`, then calls `tryLoadVecExtension(raw)` before applying migrations. The loader calls `sqlite-vec`'s `load()` and probes `SELECT vec_version()`. On success it returns `true` and creates + probes `embeddings_vec`; on failure it logs one warning and returns `false`. The result is surfaced as `OpenedCerebrumDb.vecAvailable`, which every vector consumer branches on. The Dockerfile uses `node:22-slim` (glibc) so the native `sqlite-vec` binary resolves in the production image. The same image runs the API server and the worker.

### Search

- **Semantic** (`SemanticSearchService`): embeds the query via the injected embedding client, runs `vector MATCH ? AND k = ?` k-NN against `embeddings_vec`, joins to `embeddings` for metadata, filters by `distance <= threshold`, dedupes to the closest chunk per `(source_type, source_id)`, applies `sourceTypes` filtering, resolves per-source metadata via peer pillar clients, sorts ascending by distance.
- **Hybrid** (`HybridSearchService`, default mode): runs the semantic leg and a structured/BM25 leg in parallel and merges with reciprocal rank fusion (RRF, k=60). The semantic leg is best-effort — a missing embedding client, a vec-unavailable DB, or a provider error collapses it to an empty list (logged) and hybrid falls back to BM25-only. Secret-scoped results are filtered out unless `filters.includeSecret`.
- **Similar**: reads the engram's existing vector from `embeddings_vec` directly (no embedding API call) and runs k-NN excluding the source engram.

### Pipeline

The worker (`pops-embeddings` queue) consumes `{ sourceType, sourceId, content? }`:

1. Resolve content — from the job payload, or fetched from the source (engram body or peer-pillar row) if absent. Empty/whitespace content deletes all embeddings for that source and returns.
2. Chunk with `chunkText` — max 512 tokens, 50-token overlap, using a ~4-chars/token approximation. Content under the cap is one chunk at index 0.
3. Per chunk: SHA-256 the text; if the hash matches the existing `embeddings.content_hash` for that `(source_type, source_id, chunk_index)`, **skip** (no API call). Otherwise embed the chunk, upsert the metadata row, and write the vector to `embeddings_vec` keyed by the row `id` (bound as `BigInt` — sqlite-vec's `rowid` insert rejects a plain JS number).
4. Prune orphan chunks — any `chunk_index >= new chunk count` is deleted from both tables.

Enqueueing: `EmbeddingTrigger` enqueues `{ sourceType: 'engram', ... }` on engram sync (skips empty bodies and unchanged hashes unless `force`); `cerebrum.index.reindexSources` scans peer pillars (transaction / movie / tv_show / inventory) and enqueues changed rows.

### Embedding client (config, not code)

`createHttpEmbeddingClient` is configured entirely from env so model choice is configuration: `EMBEDDING_API_URL` (default `https://api.openai.com/v1`), `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` (default `text-embedding-3-small`), `EMBEDDING_DIMENSIONS` (default 1536). OpenAI- and Voyage-compatible request bodies are auto-selected from the URL. When `EMBEDDING_API_KEY` is unset there is no client: semantic search returns no results and the worker's embeddings consumer doesn't start (curation worker still runs).

## Business Rules

- Embeddings are generated asynchronously via the `pops-embeddings` BullMQ queue.
- The embedding model is called via a remote API — model choice is env configuration, not code. No local inference.
- Content is chunked before embedding: max 512 tokens with 50-token overlap (char-count approximation).
- Re-embedding is triggered only when a chunk's `content_hash` changes; unchanged chunks are skipped without an API call.
- Semantic search embeds the query on-the-fly, then runs k-NN against stored vectors.
- Results can be filtered by `source_type` (and scope/status/secret) to scope queries to specific domains.
- Distance threshold defaults to `0.8`; results beyond it are excluded.
- `embeddings_vec.rowid == embeddings.id` is maintained by the writer, not a FK.
- The vector dimension is fixed at 1536; a model swap to a different dimensionality requires a full re-embed.

## Edge Cases

| Case                                  | Behaviour                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sqlite-vec` fails to load            | Boot continues, one warning logged, `vecAvailable=false`; semantic search throws `VEC_UNAVAILABLE` (caught by hybrid → BM25-only), non-vector features unaffected |
| No `EMBEDDING_API_KEY`                | No embedding client; semantic search returns `[]`, worker's embeddings consumer not started; hybrid degrades to BM25                                              |
| Query text empty                      | Semantic `search` throws `EMPTY_QUERY`; no API call                                                                                                               |
| Embedding provider error              | Swallowed to no-results in semantic search; hybrid logs and falls back to BM25                                                                                    |
| Content too short to chunk            | Single chunk at `chunk_index = 0`                                                                                                                                 |
| Chunk hash already embedded           | Skip re-embedding that chunk, keep existing vector                                                                                                                |
| Source content emptied / removed      | All embeddings for that `(source_type, source_id)` deleted (job sees empty content)                                                                               |
| Fewer chunks than before              | Orphan chunks (`chunk_index >= new count`) pruned from both tables                                                                                                |
| Embedding API rate-limited            | BullMQ retries with the queue's backoff config                                                                                                                    |
| Vector dimensions change (model swap) | Full re-index required — fixed `float[1536]` table; old vectors must be rebuilt                                                                                   |

## Acceptance Criteria

### Storage & extension

- [x] `sqlite-vec` is a dependency of the cerebrum pillar and loaded via `sqliteVec.load(raw)` at DB open
- [x] A startup probe verifies the extension: `SELECT vec_version()` returns a version string
- [x] Extension load failure is non-fatal — boot continues, a clear warning is logged, and vector features are marked unavailable (`vecAvailable=false`)
- [x] Dockerfile uses `node:22-slim` (glibc) so the native binary resolves in production
- [x] `embeddings` table defined in Drizzle with id, source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at
- [x] Unique index on `(source_type, source_id, chunk_index)`; indexes on `source_type` and `content_hash`
- [x] `embeddings_vec` virtual table created via `CREATE VIRTUAL TABLE ... USING vec0(vector float[1536])`, kept out of the migration journal
- [x] `embeddings_vec.rowid` matches `embeddings.id`, enforced by application code (no FK on a virtual table)
- [x] Migration `0054_embeddings_baseline.sql` written by hand and applies to an existing DB without errors
- [x] Embedding types exported for use by services and the worker

### Search

- [x] Semantic search embeds the query, runs k-NN against `embeddings_vec`, joins metadata, filters by threshold, sorts ascending by distance
- [x] `sourceTypes`, `limit` (default 20), and `threshold` (default 0.8) are honoured
- [x] Hybrid search fuses semantic + structured/BM25 legs via RRF and degrades to BM25-only when the semantic leg fails
- [x] `cerebrum.retrieval.search` / `context` / `similar` / `stats` REST routes wrap the services
- [x] `cerebrum.embeddings.status` returns coverage counts (`total`; `pending`/`stale` reserved at 0)
- [x] `cerebrum.embeddings.source-ids` returns distinct source ids for a source type
- [x] Unit/integration tests cover search over a seeded embedding set and the retrieval surface

### Pipeline

- [x] BullMQ handler processes `pops-embeddings` jobs `{ sourceType, sourceId, content? }`
- [x] Content is resolved from the payload or fetched from the source if absent
- [x] Content is chunked into max-512-token segments with 50-token overlap
- [x] Each chunk is SHA-256 hashed; matching hash → skip re-embedding
- [x] New/changed chunks call the embedding API, store the vector in `embeddings_vec`, and write metadata to `embeddings`
- [x] Orphaned chunks (index beyond the new count) are deleted from both tables
- [x] `EmbeddingTrigger` enqueues an embedding job when engram content changes (skips empty / unchanged)
- [x] `cerebrum.index.reindex-sources` scans peer pillars and enqueues embeddings for changed cross-source rows
- [x] Integration test: create content, enqueue embedding, verify vector is stored and searchable

## Out of Scope / Deferred

Items the original spec claimed but that are **not** built — see [docs/ideas/vector-storage.md](../../../ideas/vector-storage.md):

- Redis caching of query embeddings and of `content_hash → vector` (the pipeline and search re-embed every call)
- `ai_usage` cost tracking for embedding API calls (no shared usage table in the pillar; the handler's usage write is a no-op)
- Orphan cleanup as a repeatable scheduled BullMQ job (only inline per-job pruning exists)
- A `reindex(sourceType, sourceIds?)` procedure returning `{ enqueued }` for an arbitrary id list (only `reindex-sources` over whole peer source types exists)
- Real `pending` / `stale` coverage counts (held at 0)

Always out of scope:

- Specific embedding model selection — env configuration decides this
- Approximate nearest-neighbour (ANN) indexes — brute-force k-NN is sufficient at expected scale
- Local embedding model inference — remote API only
- Cross-database vector queries — vectors live only in `cerebrum.db`
