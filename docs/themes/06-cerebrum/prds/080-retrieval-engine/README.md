# PRD-080: Retrieval Engine

> Epic: [01 — Thalamus](../../epics/01-thalamus.md)
> Status: Not started

## Overview

Build the unified query layer that combines semantic search (vector k-NN via sqlite-vec), structured queries (SQLite index filters), and hybrid search (both combined) into a single retrieval API. The engine also assembles context windows for LLM consumption — ranking results by relevance, deduplicating overlapping content, respecting token budgets, and including source attribution. This PRD depends on PRD-079 (Engram Indexing & Sync) for populated indexes and PRD-076 (Vector Storage) for the embedding and similarity search primitives.

## API Surface

| Procedure                    | Input                                                                                      | Output                                              | Notes                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------- |
| `cerebrum.retrieval.search`  | query: string, mode?: 'semantic' \| 'structured' \| 'hybrid', filters?, limit?, threshold? | `{ results: RetrievalResult[], meta }`              | Unified entry point — mode defaults to `hybrid`                  |
| `cerebrum.retrieval.context` | query: string, filters?, tokenBudget?, includeMetadata?, maxResults?                       | `{ context: string, sources: SourceAttribution[] }` | Assembles a context window for LLM consumption                   |
| `cerebrum.retrieval.similar` | engramId: string, limit?, filters?                                                         | `{ results: RetrievalResult[] }`                    | Find engrams similar to a given engram by its existing embedding |
| `cerebrum.retrieval.stats`   | —                                                                                          | `{ indexed, embedded, sourceTypes, lastUpdated }`   | Retrieval layer health and coverage                              |

### Types

**`RetrievalResult`**: `{ sourceType, sourceId, title, contentPreview, score, distance?, matchType: 'semantic' | 'structured' | 'both', metadata: Record<string, unknown> }`

**`SourceAttribution`**: `{ sourceType, sourceId, title, relevanceScore, chunkRange? }`

**Filters**: `{ types?: string[], scopes?: string[], tags?: string[], dateRange?: { from?, to? }, status?: string[], sourceTypes?: string[], customFields?: Record<string, unknown>, includeSecret?: boolean }`

## Business Rules

- The default search mode is `hybrid` — semantic similarity scores are combined with structured filter matches to produce a unified ranking
- Semantic search embeds the query text on-the-fly using the same model and pipeline as content embeddings (PRD-076), then runs k-NN against `embeddings_vec`
- Structured queries filter `engram_index` and junction tables using standard SQL — type, scope prefix, tag, date range, status, and custom frontmatter fields stored in `custom_fields` JSON
- Hybrid search runs both semantic and structured queries, then merges results using reciprocal rank fusion (RRF): `score = sum(1 / (k + rank_i))` where `k = 60` and `rank_i` is the position in each result list
- Results from different source types (engrams, transactions, movies, inventory) are ranked together — source type is metadata, not a ranking factor
- Scope filtering always applies — if `filters.scopes` is provided, only results matching those scope prefixes are returned; scopes containing `.secret.` are excluded unless `filters.includeSecret` is explicitly `true`
- Distance threshold for semantic search defaults to a configured value (e.g., 0.8 cosine distance); results beyond the threshold are excluded before ranking
- The `similar` endpoint uses an existing engram's embedding vector as the query vector instead of embedding new text — it skips the embedding API call
- Context assembly respects a `tokenBudget` (default 4096 tokens) — results are added in relevance order until the budget is exhausted
- Token counting uses a fast approximation (word count \* 1.3) rather than a full tokeniser — precision is not critical for budget enforcement
- Context output is a formatted string with clear section delimiters and source attribution markers that the LLM can reference in its response
- Empty queries return an error for semantic and hybrid modes; structured mode with only filters and no query text is valid

## Edge Cases

| Case                                                        | Behaviour                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Query text is empty in semantic/hybrid mode                 | Returns error — semantic search requires a query to embed                                                                     |
| Query text is empty in structured mode with filters         | Valid — returns all results matching the filters, ordered by `modified_at` desc                                               |
| No results match                                            | Returns `{ results: [], meta: { total: 0 } }` — not an error                                                                  |
| All results exceed the distance threshold                   | Returns empty results for semantic component; structured results may still appear in hybrid mode                              |
| Token budget is smaller than a single result                | Returns one result truncated to fit the budget, with a `truncated: true` flag                                                 |
| Scope filter matches zero engrams                           | Returns empty results — no error                                                                                              |
| Custom field filter on non-JSON-indexed field               | Falls back to `json_extract()` on `custom_fields` column — slower but functional                                              |
| Engram has embedding but index entry is orphaned            | Excluded from results — orphaned entries are filtered out                                                                     |
| Domain data result has no scopes (not an engram)            | Scope filter does not apply to non-engram source types — they are always included unless explicitly filtered by `sourceTypes` |
| Query matches same content via both semantic and structured | Deduplicated in hybrid merge — single result with `matchType: 'both'` and the higher score                                    |
| Embedding model changed since content was indexed           | Results may have degraded relevance — `cerebrum.index.reindex` with `force: true` required                                    |

## User Stories

| #   | Story                                                   | Summary                                                                                  | Status      | Parallelisable          |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------- | ----------------------- |
| 01  | [us-01-semantic-search](us-01-semantic-search.md)       | Natural language query embedding and k-NN search with ranked results                     | Not started | No (first)              |
| 02  | [us-02-structured-queries](us-02-structured-queries.md) | Filter engrams by type, scope, date range, tags, and custom fields via SQLite            | Not started | Yes                     |
| 03  | [us-03-hybrid-search](us-03-hybrid-search.md)           | Combine semantic and structured search with reciprocal rank fusion                       | Not started | Blocked by us-01, us-02 |
| 04  | [us-04-context-assembly](us-04-context-assembly.md)     | Assemble context windows for LLM consumption with token budgeting and source attribution | Not started | Blocked by us-03        |

US-01 and US-02 can parallelise. US-03 merges their outputs and requires both. US-04 builds on the unified search results from US-03.

## Verification

- A natural language query like "that time I was frustrated about the API redesign" returns the relevant journal engram via semantic search
- A structured query for `{ type: 'decision', scopes: ['work.projects.karbon'], dateRange: { from: '2026-03-01' } }` returns only matching decisions
- A hybrid query for "agent coordination" filtered to `work.projects` returns results ranked by combined semantic + structured relevance
- The `similar` endpoint given an engram about LangGraph returns other engrams about agent frameworks
- Secret-scoped engrams do not appear in results unless `includeSecret: true` is passed
- Context assembly produces a formatted string under the token budget with source attributions
- Cross-source results appear: a query about "groceries" can return both a journal engram about meal planning and a transaction from the supermarket
- `cerebrum.retrieval.stats` accurately reports indexed counts per source type
- An empty query in structured mode with tag filter `['coordination']` returns all engrams tagged with `coordination`
- Orphaned index entries are excluded from all search results

## Out of Scope

- Embedding generation and storage (PRD-076 — Vector Storage)
- File watching and index sync (PRD-079 — Engram Indexing & Sync)
- LLM response generation using the assembled context (Epic 03 — Emit)
- Scope auto-assignment and classification (PRD-078, PRD-081)
- Full-text keyword search (BM25) — may be added later as an additional retrieval mode
- Caching of search results (future optimisation if needed)
- Streaming context assembly for long contexts

## Drift Check

last checked: never
