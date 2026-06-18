# US-02: Wishlist page

> PRD: [026 — Wishlist](README.md)
> Status: Done

## Description

As a user, I want a wishlist page showing my savings goals with progress so that I can track what I'm saving for.

## Acceptance Criteria

- [x] DataTable with columns: Item (with external link icon if URL), Priority (badge), Target Amount, Saved Amount, Progress (progress bar + percentage), Actions (dropdown)
- [x] Search by item name
- [x] Filter by priority
- [x] Progress bar: `(saved / target) * 100`, hidden if either is null
- [x] External link: clicking item name opens URL in new tab (if URL exists)
- [x] Loading skeleton and empty state

## Notes

Progress bar uses the `Progress` component from @pops/ui. Colour-coded: green when >= 100%.
