# US-06: Search engine consumes the registry

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a user, I want universal search to query exactly the adapters the installed modules declare so that adapters from absent modules don't fan out and don't waste a `NOT_FOUND` round-trip.

Closes the search half of #2522.

## Acceptance Criteria

- [ ] Search engine (`apps/pops-api/src/modules/core/search/engine.ts`) reads its adapter list from `MODULES.flatMap(m => m.search ?? [])`.
- [ ] `registerSearchAdapter()` and the runtime `searchAdapterRegistry` are removed. Per-module `import './search-adapter.js'` side-effect imports are removed from each module's `index.ts`.
- [ ] Each module that owns search adapters (finance, media, inventory, core/entities) declares its adapters in `manifest.ts` `search` slot. Adapter implementations themselves move into the manifest declaration (or remain in their files as named exports referenced from the manifest).
- [ ] Frontend search results panel uses `MODULES` to resolve the result-component renderer per result type; absent-module result types are filtered out before render (defence in depth — engine should never emit them now).
- [ ] PRD-057 acceptance criteria (cross-domain fan-out, ranking, structured queries) remain satisfied; only source of truth moves.
- [ ] Test: with `POPS_APPS=finance`, querying `"avocado"` (a movie) returns no results from the search engine and the response payload contains no media-typed entries.

## Notes

- `SearchAdapterDescriptor` mirrors the existing `SearchAdapter` interface — declaration migration is structural only.
- US-08 (URI resolver) closes the other half of #2522.
