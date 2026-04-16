# US-03: Hybrid Search

> PRD: [PRD-080: Retrieval Engine](README.md)
> Status: Not started

## Description

As a system querying Thalamus, I want to combine semantic similarity with structured filters in a single query so that I can find results that are both semantically relevant and match specific metadata criteria, ranked by a unified score.

## Acceptance Criteria

- [ ] A `HybridSearchService` orchestrates both semantic search (US-01) and structured queries (US-02) in parallel, then merges their results using reciprocal rank fusion (RRF)
- [ ] RRF scoring: `score = sum(1 / (k + rank_i))` where `k = 60` (constant) and `rank_i` is the 1-based position in each result list — results appearing in both lists receive contributions from both ranks
- [ ] Results appearing in both semantic and structured result sets are deduplicated into a single entry with `matchType: 'both'` and the RRF-computed score
- [ ] Results appearing in only one set receive a score contribution from that set only, with `matchType` set to `'semantic'` or `'structured'` accordingly
- [ ] The merged results are sorted by descending RRF score and capped at the requested `limit`
- [ ] Structured filters (type, scope, tags, date range, status, custom fields) are applied to the structured query component; the semantic component searches without filters but results are intersected with filter criteria post-retrieval
- [ ] Scope filtering with secret-scope exclusion applies to the final merged result set — a secret-scoped engram is excluded even if it ranks highly in the semantic component
- [ ] The unified `cerebrum.retrieval.search` procedure routes to semantic-only, structured-only, or hybrid based on the `mode` parameter, defaulting to `hybrid`
- [ ] The `cerebrum.retrieval.similar` procedure accepts an engram ID, retrieves its embedding vector, and runs a k-NN search without re-embedding — optional filters are applied post-retrieval

## Notes

- Reciprocal rank fusion is chosen over linear score combination because semantic distances and structured match counts are not on comparable scales. RRF normalises by rank position, making it robust to score distribution differences.
- The `k = 60` constant is the standard RRF value from the original paper (Cormack et al., 2009). It can be tuned later but is a solid default.
- For the `similar` endpoint, the existing engram's embedding vector is read directly from `embeddings_vec` by its `rowid` — no embedding API call needed.
- The semantic search component should request more results than the final `limit` (e.g., `limit * 3`) to give RRF enough candidates to work with. The final `limit` is applied after fusion.
- Consider early termination: if structured filters match fewer than `limit` results, the semantic component's contribution is weighted more heavily in the final ranking.
