# US-04: Multi-Domain Queries

> PRD: [PRD-082: Query Engine](README.md)
> Status: Done

## Description

As a user, I want my queries to span both engrams and POPS SQLite domain data (transactions, media, inventory) so that I can ask cross-domain questions like "what did I spend on that trip where I had the idea about X?" and get a unified answer.

## Acceptance Criteria

- [x] The `QueryRequest.domains` field accepts an array of data domains to include in retrieval: `engrams`, `transactions`, `media`, `inventory` — defaults to all domains when omitted
- [x] Thalamus cross-source retrieval returns results from both the engram index and POPS SQLite tables, each tagged with their domain type
- [x] `SourceCitation.type` differentiates between `engram` and POPS domain types (`transaction`, `media`, `inventory`) so the user knows the origin of each cited source
- [x] Transaction records are cited with their description, amount, date, and category — formatted as a human-readable excerpt
- [x] Media records are cited with their title, type, and relevant metadata (e.g., rating, watch date)
- [x] The LLM context assembly interleaves engram content and POPS records by relevance score — domain type does not affect ranking order
- [x] Cross-domain questions that combine knowledge from engrams with structured data from POPS produce a unified answer that cites both source types
- [x] Domain filtering is applied at retrieval time — excluding a domain removes it from the Thalamus query, not from post-retrieval filtering

## Notes

- This story depends on Thalamus (PRD-080) having implemented cross-source indexing. The query engine consumes this capability but does not implement it.
- POPS domain data (transactions, media, inventory) is already stored in SQLite and managed by existing POPS modules. The query engine accesses this data through Thalamus's cross-source retrieval API, not directly.
- Cross-domain queries are a key differentiator — they enable the "what did I spend on the trip where I had the idea about X" use case from the theme README.
- Consider how to handle domain-specific structured data (amounts, dates, ratings) in the LLM context — raw JSON may not be the most effective format for the model.
