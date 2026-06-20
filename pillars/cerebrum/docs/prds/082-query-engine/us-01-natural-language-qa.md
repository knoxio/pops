# US-01: Natural Language Q&A

> PRD: [PRD-082: Query Engine](README.md)
> Status: Done

## Description

As a user, I want to ask a natural language question and receive a grounded answer generated from my stored engrams and POPS data so that I can retrieve knowledge without remembering where I stored it or how I categorised it.

## Acceptance Criteria

- [x] The `cerebrum.query.ask` tRPC procedure accepts a `QueryRequest` with at minimum a `question` string and returns a `QueryResponse` containing `answer`, `sources`, `scopes`, and `confidence`
- [x] The query pipeline: (1) normalises the question, (2) calls Thalamus for semantic + structured retrieval, (3) ranks retrieved sources by relevance score, (4) assembles a context window from the top sources (respecting LLM context limits), (5) sends the context + question to the LLM for answer generation
- [x] The LLM prompt instructs the model to answer only from the provided context, to cite sources by engram ID inline (e.g., `[eng_20260417_0942_agent-coordination]`), and to state explicitly when the context is insufficient
- [x] If Thalamus returns zero results above the relevance threshold (configurable, default 0.3), the response is `{ answer: "I don't have information about that.", sources: [], confidence: "low" }`
- [x] The `cerebrum.query.retrieve` endpoint returns raw sources without generating an answer — useful for programmatic consumers
- [x] The `cerebrum.query.explain` endpoint returns the scope inference and retrieval plan for a question without executing the full pipeline
- [x] Confidence is derived from retrieval metrics: `high` when the top source has relevance > 0.8, `medium` for 0.5-0.8, `low` below 0.5
- [x] Query responses complete within 3 seconds for a corpus of up to 100,000 engrams (excluding LLM generation time, which is bounded by the provider's latency)

## Notes

- Context assembly should prioritise diversity of sources — if the top 10 results are all from the same engram, deduplicate by engram ID and include the next-highest-relevance unique source.
- The LLM prompt should be a system prompt that can be iterated on without code changes — store it as a configurable template.
- Thalamus retrieval combines embedding-based semantic search with structured SQLite queries (type, tag, date filters) — this story does not implement Thalamus, it consumes its retrieval API.
- The relevance threshold should be configurable to allow tuning as the corpus grows.
