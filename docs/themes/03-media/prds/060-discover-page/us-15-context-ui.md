# US-15: Context-aware picks frontend rows

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to see 1-2 themed movie rows that match the current time or season so I get contextually relevant suggestions.

## Acceptance Criteria

- [ ] Renders 1-2 `HorizontalScrollRow` components from active context collections
- [ ] Each row titled with collection title + emoji (e.g., "Date Night")
- [ ] Each row supports Load More
- [ ] Hidden when no collections match (should not happen — fallback always matches)
- [ ] Loading skeleton while endpoint resolves
- [ ] Tests cover: rows render with themed titles, load more works
