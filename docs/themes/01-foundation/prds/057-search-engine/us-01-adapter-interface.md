# US-01: Search adapter interface

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a developer, I want a SearchAdapter interface and registration pattern so that each domain can make its data searchable.

## Acceptance Criteria

- [ ] `SearchAdapter` interface defined: domain, types, search method
- [ ] `SearchResult` interface defined: uri, title, type, domain, metadata, score
- [ ] Registration function: `registerSearchAdapter(adapter)` adds to adapter registry
- [ ] `searchAll(query, context?)` fans query to all registered adapters
- [ ] Adding a new domain's search = implement adapter + register it
- [ ] Tests with mock adapters

## Notes

The adapter pattern means the search engine doesn't know about domain internals. Each domain owns its search logic.

The adapter registry lives in a `search` module under the API core: `apps/pops-api/src/modules/core/search/`. The registry is a plain array populated at startup — each domain adapter file calls `registerSearchAdapter()` during module initialization (side-effect import in the API entry point, same pattern as tRPC router composition). No dynamic discovery needed.
