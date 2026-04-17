# ADR-018: sqlite-vec for Vector Storage

## Status

Accepted

## Context

The Cortex service needs semantic search — finding content by meaning rather than keywords. BM25 keyword search (used by obsidian-brain) degrades when queries don't share exact terms with stored content. Semantic search requires vector embeddings: numerical representations of text that capture meaning, stored in a way that supports efficient similarity queries (k-nearest-neighbour).

POPS follows a "one database" philosophy (ADR-001). Adding a dedicated vector database (Pinecone, Weaviate, Milvus) introduces a new operational dependency, a new backup target, and a new failure mode — all for a single-user system that will store thousands to low hundreds of thousands of vectors, not millions.

## Options Considered

| Option                  | Pros                                                                            | Cons                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| sqlite-vec (SQLite ext) | Same database, zero new infra, ACID with rest of data, sub-ms for <100k vectors | Brute-force k-NN (no ANN index), slower at millions of vectors, C extension to load        |
| pgvector (PostgreSQL)   | ANN indexes (IVFFlat, HNSW), mature, scalable                                   | Requires PostgreSQL migration (28 tables), operational overhead, overkill for single-user  |
| Pinecone / Weaviate     | Purpose-built, fast at scale, managed                                           | External dependency, network latency, vendor lock-in, subscription cost, backup complexity |
| ChromaDB                | Simple API, Python-native, local mode                                           | Separate process, own storage, not queryable alongside SQLite data                         |
| Store in Redis          | Already adding Redis (ADR-016), supports vector search via RediSearch           | Ephemeral by design (ADR-016), vectors would need regeneration on restart, not ACID        |

## Decision

sqlite-vec. Vectors live in the same SQLite database as all other POPS data, queryable in the same transactions, backed up by the same pipeline, migrated by the same system (Drizzle).

For the expected scale (tens of thousands of entries over years of personal use), brute-force k-NN with 384-dimensional vectors completes in single-digit milliseconds. If scale ever demands approximate nearest-neighbour indexing, sqlite-vec supports auxiliary ANN indexes that can be added without schema changes.

Embeddings are generated via remote API (not local models) and cached in Redis (ADR-016) to avoid redundant API calls. The SQLite table stores the final vector alongside a foreign key to the source content, enabling joins between semantic search results and structured data.

## Consequences

- `sqlite-vec` loaded as a runtime extension via `db.loadExtension()` in the database connection setup
- New `embeddings` table: `source_type`, `source_id`, `content_hash`, `vector`, `model`, `created_at`
- Embedding generation is a background job (BullMQ via ADR-016), not synchronous with content creation
- Similarity search is a service-layer function that combines vector k-NN with optional metadata filters
- The extension must be compiled or distributed for both development (macOS ARM) and production (Linux x86_64) — handled via npm package `sqlite-vec`
- Migration path to pgvector exists if scale demands it — the embedding schema is portable, only the query syntax changes
- Backup size increases proportionally with vector count (~1.5KB per 384-dim float32 vector)
