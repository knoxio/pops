# PRD-076: Vector Storage

> Epic: [08 — Cortex Infrastructure](../../epics/08-cortex-infrastructure.md)
> Status: Not started

## Overview

Add sqlite-vec as a runtime extension to the existing SQLite database, enabling vector storage and semantic similarity search. Define the embedding schema, build a similarity search service, and create a background embedding generation pipeline that processes content asynchronously via BullMQ.

## Data Model

### embeddings

| Column          | Type    | Constraints         | Description                                                   |
| --------------- | ------- | ------------------- | ------------------------------------------------------------- |
| id              | INTEGER | PK, autoincrement   | Embedding record ID                                           |
| source_type     | TEXT    | NOT NULL            | Source table name (e.g., `transactions`, `notes`)             |
| source_id       | TEXT    | NOT NULL            | ID of the source record                                       |
| chunk_index     | INTEGER | NOT NULL, default 0 | Index within multi-chunk content (0 for single-chunk)         |
| content_hash    | TEXT    | NOT NULL            | SHA-256 of the embedded text — skip re-embedding if unchanged |
| content_preview | TEXT    | NOT NULL            | First 200 chars of embedded text for debugging                |
| model           | TEXT    | NOT NULL            | Model used to generate the embedding                          |
| dimensions      | INTEGER | NOT NULL            | Vector dimensionality (e.g., 384, 1024)                       |
| created_at      | TEXT    | NOT NULL, ISO 8601  | When the embedding was generated                              |

**Indexes:**

- Unique on `(source_type, source_id, chunk_index)` — one embedding per chunk per source
- Index on `source_type` for filtered similarity search
- Index on `content_hash` for deduplication

### embeddings_vec (virtual table)

| Column | Type    | Description                       |
| ------ | ------- | --------------------------------- |
| rowid  | INTEGER | Matches `embeddings.id`           |
| vector | FLOAT[] | The embedding vector (sqlite-vec) |

This is a sqlite-vec virtual table that stores the actual vectors and supports k-NN queries. The `rowid` joins to `embeddings.id` for metadata.

## API Surface

| Procedure                 | Input                                          | Output                        | Notes                                   |
| ------------------------- | ---------------------------------------------- | ----------------------------- | --------------------------------------- |
| `core.embeddings.search`  | query (text), sourceTypes?, limit?, threshold? | `{ results: SearchResult[] }` | Semantic search across embedded content |
| `core.embeddings.status`  | sourceType?                                    | `{ total, pending, stale }`   | Embedding coverage stats                |
| `core.embeddings.reindex` | sourceType, sourceIds?                         | `{ enqueued: number }`        | Enqueue re-embedding jobs               |

`SearchResult`: `{ sourceType, sourceId, chunkIndex, contentPreview, score, distance }`

## Business Rules

- Embeddings are generated asynchronously via the `pops:embeddings` BullMQ queue (PRD-074)
- The embedding model is called via remote API (not local inference) — model choice is configuration, not code
- Content is chunked before embedding — chunks are max 512 tokens with 50-token overlap
- Re-embedding is triggered when `content_hash` changes (content was modified)
- `core.embeddings.search` embeds the query text on-the-fly, then runs k-NN against stored vectors
- Search results can be filtered by `source_type` to scope queries to specific domains
- Distance threshold defaults to a configured value — results beyond the threshold are excluded
- Embedding API calls are tracked in the `ai_usage` table (existing pattern)

## Edge Cases

| Case                                  | Behaviour                                                              |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Source record deleted                 | Orphaned embeddings cleaned up by a periodic BullMQ job                |
| Embedding API rate-limited            | BullMQ retries with backoff (inherits from queue config)               |
| Content too short to chunk            | Single chunk with `chunk_index = 0`                                    |
| Same content hash already embedded    | Skip re-embedding, return existing embedding                           |
| sqlite-vec extension fails to load    | API starts but embedding/search features return 503 with clear message |
| Query text is empty                   | Returns empty results, no API call                                     |
| Vector dimensions change (model swap) | Full re-index required — old embeddings with wrong dimensions deleted  |

## User Stories

| #   | Story                                                       | Summary                                                                  | Status      | Parallelisable   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ----------- | ---------------- |
| 01  | [us-01-sqlite-vec-extension](us-01-sqlite-vec-extension.md) | Install and load sqlite-vec in both dev and prod, verify with smoke test | Not started | No (first)       |
| 02  | [us-02-embedding-schema](us-02-embedding-schema.md)         | Drizzle schema for embeddings table and sqlite-vec virtual table         | Not started | Blocked by us-01 |
| 03  | [us-03-search-service](us-03-search-service.md)             | Similarity search service with k-NN queries, filtering, thresholds       | Not started | Blocked by us-02 |
| 04  | [us-04-embedding-pipeline](us-04-embedding-pipeline.md)     | BullMQ job handler for embedding generation, chunking, deduplication     | Not started | Blocked by us-02 |

US-03 and US-04 can parallelise after US-02.

## Verification

- sqlite-vec loads successfully on both macOS ARM (dev) and Linux x86_64 (prod)
- Inserting a vector and querying for nearest neighbours returns correct results
- Embedding generation job processes content, chunks it, calls the API, and stores vectors
- `core.embeddings.search` returns semantically relevant results for a natural-language query
- Re-embedding skips unchanged content (same `content_hash`)
- Orphan cleanup removes embeddings for deleted source records
- `core.embeddings.status` accurately reports total, pending, and stale counts
- Embedding API costs are tracked in `ai_usage`

## Out of Scope

- Specific embedding model selection (Cortex theme decides this)
- Approximate nearest-neighbour (ANN) indexes — brute-force k-NN is sufficient at expected scale
- Hybrid search (combining vector + keyword) — future enhancement
- Local embedding model inference — remote API only
- Cross-database vector queries (e.g., querying vectors from a different SQLite file)

## Drift Check

last checked: 2026-04-17
