# US-08: Fan-out and section ordering

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As the system, I fan a query out to all registered adapters in parallel, collect results into sections, and order them by context.

## Acceptance Criteria

- [x] `searchAll(query: Query, context: SearchContext)` fans query + context to all registered adapters in parallel (`Promise.allSettled`)
- [x] If one adapter fails, other results still returned — failed section omitted with console warning
- [x] Results collected into sections (one per adapter domain)
- [x] Context sections: adapters whose domain belongs to the current app appear first, with `isContextSection: true`
- [x] Other sections ordered by highest score in section (descending)
- [x] Each section limited to 5 hits
- [x] Each section includes `totalCount` for "show more" UI
- [x] Response shape: `{ sections: Array<{ domain, icon, color, isContextSection, hits: SearchHit[], totalCount }> }`
- [x] Tests: fan-out calls all adapters, failure isolation works, context sections first, ordering by max score

## Notes

The engine does NOT re-score hits — adapters own their scores. Context app mapping: `"movies"` and `"tv-shows"` both belong to the `"media"` app. The engine needs a domain→app mapping to determine which sections are context sections.
