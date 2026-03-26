# US-04: Items at location

> PRD: [047 — Location Tree Management](README.md)
> Status: To Review

## Description

As a user, I want to see which items are at a selected location so that I can browse my inventory by physical location.

## Acceptance Criteria

- [ ] Selecting a tree node loads items for that location in a side panel (desktop) or below the tree (mobile)
- [ ] Panel header shows location name and breadcrumb path (e.g., "Home > Office > Desk")
- [ ] Item list displays: name, asset ID, type badge — one row per item
- [ ] "Include sub-locations" toggle — when enabled, shows items from the selected location and all its descendants
- [ ] Toggle state persisted in session storage
- [ ] Items fetched via `inventory.items.list` with `locationId` filter (and `includeChildren` flag for sub-locations)
- [ ] Clicking an item row navigates to the item detail page
- [ ] Loading state while items fetch
- [ ] Empty state: "No items at this location" (or "No items at this location or its sub-locations" when toggle is on)
- [ ] Item count in panel header updates to reflect the current list (matches the badge on the tree node when toggle is off)

## Notes

The "Include sub-locations" query is handled server-side — the API accepts a `locationId` and `includeChildren` boolean, and uses a recursive CTE to gather all descendant location IDs. The panel does not support editing items — it's a read-only browser. Item detail navigation is the entry point for edits.
