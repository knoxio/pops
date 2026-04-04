# US-15: Context-aware picks frontend rows

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a user, I want to see 1-2 themed movie rows that match the current time or season so I get contextually relevant suggestions.

## Acceptance Criteria

- [x] Renders 1-2 `HorizontalScrollRow` components from active context collections
- [x] Each row titled with collection title + emoji (e.g., "Date Night")
- [x] Each row supports Load More
- [x] Hidden when no collections match (should not happen — fallback always matches)
- [x] Loading skeleton while endpoint resolves
- [x] Tests cover: rows render with themed titles, load more works
