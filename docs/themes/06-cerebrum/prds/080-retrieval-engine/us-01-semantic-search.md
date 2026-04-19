# US-01: Semantic Search

> PRD: [PRD-080: Retrieval Engine](README.md)
> Status: Done

## Description

As a system querying Thalamus, I want to submit a natural language query and receive ranked results based on semantic similarity so that I can find relevant engrams and domain data by meaning rather than exact keyword matches.

## Acceptance Criteria

- [x] A `SemanticSearchService` accepts a query string, embeds it using the same model and pipeline as content embeddings (PRD-076), and runs a k-NN query against the `embeddings_vec` virtual table
- [x] Results are returned as `RetrievalResult[]` ordered by ascending distance (closest = most relevant), including `sourceType`, `sourceId`, `title`, `contentPreview` (first 200 characters of the source content), `score` (normalised 0-1 where 1 is most relevant), and `distance` (raw cosine distance)
- [x] A configurable distance threshold (default 0.8) excludes results beyond the threshold — they are not included in the output
- [x] The `limit` parameter caps the number of results returned (default 20, max 100)
- [x] Results join back to `engram_index` (for engram sources) or the originating domain table (for cross-source data) to populate `title` and metadata
- [x] Orphaned index entries (`status: orphaned`) are excluded from results
- [x] An empty or whitespace-only query returns a validation error — no embedding API call is made
- [x] The query embedding is not persisted — it is used for the single k-NN query and discarded

## Notes

- The similarity search primitive is already built in PRD-076 (`core.embeddings.search`). This story wraps it with Thalamus-specific metadata resolution and result shaping for the retrieval API.
- Cosine distance via sqlite-vec: lower distance = more similar. The `score` field should invert this for consumer convenience (e.g., `score = 1 - distance`).
- For cross-source results (transactions, movies, etc.), the `title` is composed from domain-specific fields (e.g., transaction description, movie title) — reuse the `toEmbeddableText()` logic from PRD-079 US-04 or a simpler `toTitle()` variant.
- Consider caching the query embedding for the duration of a hybrid search request (US-03) to avoid embedding the same query twice.
