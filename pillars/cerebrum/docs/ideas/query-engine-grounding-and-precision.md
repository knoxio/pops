# Query engine — grounding & precision (deferred)

Forward-looking gaps in the cerebrum query engine. The core pipeline (ask / retrieve / explain / SSE stream, scope-aware retrieval, citation attribution, cross-pillar multi-domain) ships today — see the [query-engine PRD](../prds/query-engine.md). These items are the unbuilt remainder.

## Ground scope inference in a live scope registry

The `QueryScopeInferencer` accepts a `knownScopes` pool, but the query service always calls `infer(question, undefined, ...)` — it never passes the pool. So a work/personal keyword hit filters an empty list and falls through to `source: 'default'` anyway; keyword inference is effectively inert beyond explicit overrides. Build this:

- Load the live scope set (from the engram index / scope registry) and pass it as the inference pool so keyword hits resolve to real `work.*` / `personal.*` scopes.
- Make the keyword/pattern lists configurable (file or scope-registry-derived) instead of the hardcoded `WORK_KEYWORDS` / `PERSONAL_KEYWORDS` constants.
- Prefer existing scopes over inventing new scope patterns.

## Structured retrieval for non-engram domains

The structured (BM25) leg returns engrams only (`if (filters.sourceTypes && !filters.sourceTypes.includes('engram')) return []`). Cross-domain rows reach a query exclusively through the semantic leg, which needs both a stored embedding for the row and a registered peer — so a domain with no embeddings is silently invisible to structured-only retrieval. Build a structured retrieval path for transaction/media/inventory (or guarantee embedding coverage) so multi-domain queries don't depend on the semantic leg being available.

## Fix the `media` domain → source-type mapping

`DOMAIN_MAP.media = 'media'`, but media rows are stored under source types `movie` and `tv_show`. Filtering `domains: ['media']` therefore matches nothing. Map `media` to both `movie` and `tv_show` (the domain enum is coarser than the stored source types).

## Relative-date resolution

"What did I spend last Tuesday?" — no relative/natural-language date is resolved to an absolute range for structured filtering today. Add date-phrase resolution that feeds `dateRange` filters.

## Direct engram-by-ID lookup bypass

A question that references an engram by its ID still goes through semantic + structured search. Add a fast path that detects an explicit engram ID and fetches that record directly, bypassing ranking.

## Thalamus-style availability signalling

There is no `{ available: false }` short-circuit when the retrieval/embedding backend is down — the semantic leg degrades silently to BM25-only and the LLM degrades to a fallback string. If a hard "retrieval unavailable" response is wanted (rather than answering from a degraded corpus), surface an explicit availability error.

## Latency target verification

The original spec targeted answers within 3s for a 100k-engram corpus. There is no benchmark or guard enforcing this. Add a retrieval/answer latency benchmark and budget once corpus sizes grow.

## Future

- Multi-turn conversational Q&A (owned by Ego, not this stateless engine).
- Answer caching / precomputation.
- Clickable citations linking into the engram view in the shell.
- User feedback on answer quality feeding retrieval tuning.
