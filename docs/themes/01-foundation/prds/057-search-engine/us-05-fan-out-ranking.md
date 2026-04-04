# US-05: Fan-out and ranking

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I fan a query out to all registered adapters with the current context and return context-ordered sections for the search UI to render.

## Acceptance Criteria

- [ ] `searchAll(query: Query, context: SearchContext)` fans query + context to all registered adapters in parallel (`Promise.allSettled`)
- [ ] If one adapter fails, other results still returned — failed adapter's section omitted with console warning
- [ ] Results collected into sections (one per domain)
- [ ] Context section: current app's domain appears first, with visual distinction flag (`isContextSection: true`)
- [ ] Context section returns first 5 hits
- [ ] Other sections return first 5 hits each, ordered by highest score in section (descending)
- [ ] Each section includes `totalCount` for "show more" UI
- [ ] `showMore(domain, query, context, offset)` returns next page of results for a single domain
- [ ] Fast: total search time < 200ms for libraries up to 500 items per domain
- [ ] Response shape: `{ sections: Array<{ domain, icon, color, isContextSection, hits: SearchHit[], totalCount }> }`

## Notes

Fan-out is parallel — all adapters query simultaneously. The engine collects, sections, and returns. It does NOT re-score hits — adapters own their scores. The engine only uses `score` for ordering sections relative to each other (by max score in section).

Context comes from PRD-058's `SearchContext`. The engine's only context-aware behavior is putting the matching domain first.
