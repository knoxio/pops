# US-10b: Wishlist result component (frontend)

> PRD: [057 — Search Engine](README.md)
> Status: Done

## Description

As a user, I want wish list search results to show the item name, priority, and target amount so I can find the right item.

## Acceptance Criteria

- [x] `WishlistResult` registered in frontend registry for domain `"wishlist"`
- [x] Renders: item name + priority (if set) + formatted target amount (if set)
- [x] Highlights matched portion of item name using `query` prop + `matchField`/`matchType`
- [x] Tests: renders correctly, highlighting works

## Notes

Component lives in `packages/app-finance/`. Depends on US-10 for hit data shape.
