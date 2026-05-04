# US-04: Embedding Pipeline

> PRD: [Vector Storage](README.md)
> Status: Done

## Description

As a platform operator, I enqueue content for embedding and it gets processed in the background so that new content is searchable without blocking the user's workflow.

## Acceptance Criteria

- [x] BullMQ handler in `src/jobs/handlers/embeddings.ts` processes embedding jobs from the `pops-embeddings` queue
- [x] Job data includes `sourceType`, `sourceId`, and optionally `content` (fetched from DB if not provided)
- [x] Content is chunked into segments of max 512 tokens with 50-token overlap
- [x] Each chunk is hashed (SHA-256) — if the hash matches the existing `content_hash` in `embeddings`, skip re-embedding
- [x] New/changed chunks call the embedding API, store the vector in `embeddings_vec`, and write metadata to `embeddings`
- [x] Orphaned chunks (chunk_index beyond the new chunk count) are deleted
- [x] Embedding API calls are tracked in `ai_usage` (model, tokens, cost)
- [x] Embedding results are cached in Redis (content_hash → vector) to avoid redundant API calls for identical content
- [x] `cleanupOrphanedEmbeddings()` function implemented — wire as BullMQ repeatable job in PRD-074
- [x] `embedContent(sourceType, sourceId)` utility function enqueues an embedding job — used by other modules when content changes
- [x] Integration test: create content, enqueue embedding, verify vector is stored and searchable

## Notes

The chunking strategy is intentionally simple (token-count split with overlap). Cortex may refine this later with content-aware chunking (split on paragraphs, headings, etc.). The pipeline should be structured so the chunking function is swappable.
