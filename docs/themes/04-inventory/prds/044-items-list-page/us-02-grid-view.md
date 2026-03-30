# US-02: Grid view and view toggle

> PRD: [044 — Items List Page](README.md)
> Status: Done

## Description

As a user, I want a card grid view of my inventory items with photos and a toggle to switch between table and grid views so that I can browse visually or in detail as I prefer.

## Acceptance Criteria

- [x] Grid renders responsive columns: 2 (mobile) → 3 (tablet) → 4 (md) → 5 (lg/xl) — grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5
- [x] Each card displays: primary photo (or placeholder), item name, asset ID, type badge, location — vertical layout variant with photo area, name, asset ID badge, type badge overlay, and location with MapPin icon
- [x] Cards use a consistent aspect ratio for the photo area — 4:3 aspect ratio on all cards
- [x] Placeholder renders when an item has no photos (generic inventory icon, not a broken image) — Package icon from lucide-react
- [x] Type badge renders on each card (e.g., "Electronics", "Furniture")
- [x] Clicking a card navigates to `/inventory/items/:id`
- [x] Card has hover/focus state (subtle scale or shadow transition)
- [x] View toggle (Table/Grid) is positioned adjacent to the filters row, not in the page header
- [x] View toggle state is persisted in localStorage under a dedicated key
- [x] On page load, the view mode is restored from localStorage (default: table if no preference stored)
- [x] Grid uses the same `inventory.items.list` data and pagination as the table view
- [x] Tests cover: card content rendering, placeholder display, click navigation, both layout variants, photo error handling — 18 tests in InventoryCard.test.tsx

## Notes

The view toggle should be a segmented control or icon button pair (table icon / grid icon). Both views share the same data source and filter state — switching views does not re-fetch data. Grid cards should handle long item names with truncation (1-2 lines).
