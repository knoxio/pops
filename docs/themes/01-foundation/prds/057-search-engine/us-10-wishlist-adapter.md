# US-10: Wishlist search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As the system, I search wish list items by name and return typed `SearchHit` results with priority and target amount.

## Acceptance Criteria

- [x] Adapter registered with `domain: "wishlist"`, icon: `"Star"`, color: `"yellow"`
- [x] Searches `wish_list` table by `item` column (case-insensitive LIKE)
- [x] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [x] `matchField: "item"` and `matchType` set correctly per hit
- [x] Hit data shape: `{ item, priority, targetAmount }`
- [x] URI navigates to `/finance/wishlist` (no per-item detail page exists)
- [x] Respects `options.limit` parameter
- [x] Tests: search returns correct hits, scoring correct

## Notes

Only `item` is searched. `priority` and `targetAmount` are included in hit data for display only.
