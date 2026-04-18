# US-03: Similarity Search Service

> PRD: [Vector Storage](README.md)
> Status: Done

## Description

As a developer building Cortex features, I call a search service with a natural-language query and get semantically relevant results so that I can build retrieval-augmented features without touching vector internals.

## Acceptance Criteria

- [x] `src/modules/core/embeddings/service.ts` exports `semanticSearch(query, options)` function
- [x] `options` includes: `sourceTypes` (filter), `limit` (default 10), `threshold` (max distance)
- [x] The function embeds the query text by calling the embedding API, then runs k-NN against `embeddings_vec`
- [x] Results join `embeddings_vec` with `embeddings` to return metadata (source_type, source_id, content_preview, score)
- [x] Results are sorted by distance (ascending — closest first)
- [x] Results beyond the distance threshold are excluded
- [x] Query embedding is cached in Redis with TTL (avoid re-embedding identical queries within a session)
- [x] tRPC procedure `core.embeddings.search` wraps the service function
- [x] tRPC procedure `core.embeddings.status` returns embedding counts (total, pending re-index, stale)
- [x] tRPC procedure `core.embeddings.reindex` enqueues embedding jobs for specified sources
- [ ] Unit tests verify search returns correct results from a seeded embedding set

## Notes

The service abstracts the vector query syntax — callers provide text and get ranked results. This is the foundation that Cortex's retrieval layer builds on.
