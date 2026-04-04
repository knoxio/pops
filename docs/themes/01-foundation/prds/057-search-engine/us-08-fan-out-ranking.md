# US-08: Fan-out and section ordering

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I fan a query out to all registered adapters in parallel, collect results into sections, and order them by context.

## Acceptance Criteria

- [ ] `searchAll(query: Query, context: SearchContext)` fans query + context to all registered adapters in parallel (`Promise.allSettled`)
- [ ] If one adapter fails, other results still returned — failed section omitted with console warning
- [ ] Results collected into sections (one per adapter domain)
- [ ] Context sections: adapters whose domain belongs to the current app appear first, with `isContextSection: true`
- [ ] Other sections ordered by highest score in section (descending)
- [ ] Each section limited to 5 hits
- [ ] Each section includes `totalCount` for "show more" UI
- [ ] Response shape: `{ sections: Array<{ domain, icon, color, isContextSection, hits: SearchHit[], totalCount }> }`
- [ ] Tests: fan-out calls all adapters, failure isolation works, context sections first, ordering by max score

## Notes

The engine does NOT re-score hits — adapters own their scores. Context app mapping: `"movies"` and `"tv-shows"` both belong to the `"media"` app. The engine needs a domain→app mapping to determine which sections are context sections.
