# US-01: Search adapter interface

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a developer, I want a SearchAdapter interface with typed results and a component registration pattern so that each domain can make its data searchable with its own result layout.

## Acceptance Criteria

- [ ] `SearchAdapter<T>` interface: `domain`, `icon`, `color`, `search(query, context, options)`, `ResultComponent`
- [ ] `SearchHit<T>` interface: `uri`, `score`, `matchField`, `matchType`, `data: T`
- [ ] `Query` interface: `text`, optional `filters` (for v2 structured syntax)
- [ ] `SearchContext` interface: `app`, `page`, optional `entity` and `filters` — sourced from PRD-058
- [ ] `registerSearchAdapter(adapter)` adds to an adapter registry
- [ ] `getAdapters()` returns all registered adapters
- [ ] Type erasure at the registry boundary — registry stores `SearchAdapter<unknown>`, each adapter is internally typed
- [ ] Tests with mock adapters: registration, retrieval, search call with query + context

## Notes

The adapter registry lives in `apps/pops-api/src/modules/core/search/`. Each domain adapter calls `registerSearchAdapter()` during module initialization — same pattern as tRPC router composition (side-effect import in the API entry point).

The `ResultComponent` lives in the frontend (app packages), not the API. The API-side adapter provides the search function; the frontend-side registration provides the component. Both are keyed by `domain`. The tRPC layer bridges them — the API returns `SearchHit<unknown>[]` per section, the frontend maps `domain → ResultComponent` to render.
