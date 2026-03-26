# US-02: Grid view and view toggle

> PRD: [044 — Items List Page](README.md)
> Status: To Review

## Description

As a user, I want a card grid view of my inventory items with photos and a toggle to switch between table and grid views so that I can browse visually or in detail as I prefer.

## Acceptance Criteria

- [ ] Grid renders responsive columns: 2 (mobile) → 3 (tablet) → 4 (md) → 5 (lg/xl)
- [ ] Each card displays: primary photo (or placeholder), item name, asset ID, type badge, location
- [ ] Cards use a consistent aspect ratio for the photo area
- [ ] Placeholder renders when an item has no photos (generic inventory icon, not a broken image)
- [ ] Type badge renders on each card (e.g., "Electronics", "Furniture")
- [ ] Clicking a card navigates to `/inventory/items/:id`
- [ ] Card has hover/focus state (subtle scale or shadow transition)
- [ ] View toggle (Table/Grid) is positioned adjacent to the filters row, not in the page header
- [ ] View toggle state is persisted in localStorage under a dedicated key
- [ ] On page load, the view mode is restored from localStorage (default: table if no preference stored)
- [ ] Grid uses the same `inventory.items.list` data and pagination as the table view
- [ ] Tests cover: responsive column count at breakpoints, card content rendering, placeholder display, view toggle persistence in localStorage, click navigation

## Notes

The view toggle should be a segmented control or icon button pair (table icon / grid icon). Both views share the same data source and filter state — switching views does not re-fetch data. Grid cards should handle long item names with truncation (1-2 lines).
