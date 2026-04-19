# US-04: Cross-Source Index

> PRD: [PRD-079: Engram Indexing & Sync](README.md)
> Status: Done

## Description

As the Thalamus indexing service, I need to index existing POPS domain data (transactions, movies, TV shows, books, inventory items) into the embedding pipeline so that semantic search can return results from both engrams and structured domain data, giving a unified retrieval layer across all personal knowledge.

## Acceptance Criteria

- [x] A `CrossSourceIndexer` service defines a source-type-specific `toEmbeddableText()` function for each domain: transactions (description + notes + category + merchant), movies (title + synopsis + genres + personal notes), TV shows (title + overview + genres + personal notes), books (title + author + description + personal notes), and inventory (name + description + category + location + notes)
- [x] Each `toEmbeddableText()` function produces a plain-text string with labelled sections (e.g., `Title: ...\nSynopsis: ...\nGenres: ...`) suitable for embedding — fields that are null or empty are omitted
- [x] A scheduled BullMQ job (`pops:cross-source-index`, configurable interval, default every 6 hours) scans each domain table for records that either have no corresponding row in the `embeddings` table or whose computed `content_hash` differs from the stored hash
- [x] For each stale or missing record, the service enqueues an embedding job to the `pops:embeddings` queue with `{ sourceType, sourceId, contentHash, contentText }` — the content text is included in the payload so the embedding worker does not need to query domain tables
- [x] The `cerebrum.index.reindexSources` API triggers an immediate run of the cross-source indexer for the specified source types (or all if none specified), returning the count of jobs enqueued
- [x] Content hashes are computed as SHA-256 of the `toEmbeddableText()` output — if the composed text hasn't changed, the record is skipped
- [x] The indexer processes records in batches of 100 to avoid loading entire domain tables into memory
- [x] Each source type can be independently enabled or disabled via configuration, defaulting to all enabled

## Notes

- This story is independent of the file watcher pipeline (US-01 through US-03) — it reads from SQLite domain tables, not from the filesystem.
- The `content_hash` for domain data is computed from the composed embeddable text, not from any single database column. This means a change to any contributing field triggers re-embedding.
- Domain tables already exist in the POPS SQLite database (transactions from the finance module, movies/shows/books from the media module, inventory from the storage module). This story does not create or modify those tables.
- The `contentText` field in the job payload avoids coupling the embedding worker to domain-specific table schemas — the worker just embeds whatever text it receives.
- Future domain sources (e.g., recipes, contacts) can be added by implementing a new `toEmbeddableText()` function and registering the source type — the pipeline is generic.
