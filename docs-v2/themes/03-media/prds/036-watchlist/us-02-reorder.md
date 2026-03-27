# US-02: Watchlist reorder

> PRD: [036 — Watchlist](README.md)
> Status: Done

## Description

As a user, I want to reorder my watchlist by dragging items (desktop) or using up/down buttons (mobile) so that I can prioritise what to watch next.

## Acceptance Criteria

- [x] Desktop: drag-and-drop reorder on watchlist items — grab handle visible on hover
- [x] Mobile: up/down arrow buttons beside each watchlist entry
- [x] Dragging an item to a new position updates the visual order immediately (optimistic)
- [x] On drop (desktop) or button press (mobile), call `media.watchlist.reorder` with the full ordered list of `{ id, priority }` pairs
- [x] Priority values are sequential integers (1, 2, 3...) with no gaps or duplicates
- [x] Priority badges update to reflect the new order after reorder
- [x] If the reorder API call fails, revert the list to its previous order and show an error toast
- [x] Drag-and-drop cancelled mid-drag (escape key or drop outside target) reverts to original order without an API call
- [x] Reorder controls are hidden when the list has fewer than 2 items
- [x] Up button is hidden/disabled on the first item; down button is hidden/disabled on the last item
- [x] Reorder is disabled while a previous reorder request is in flight
- [x] Tests cover: drag-and-drop changes order, up/down buttons move items, API called with correct priorities, error reverts order, single-item list hides controls

## Notes

Use a drag-and-drop library that supports both mouse and touch events for cross-platform consistency. The `reorder` procedure wraps the batch priority update in a single transaction to prevent partial updates. The full list is sent on each reorder to avoid conflict resolution — the server assigns the priorities exactly as received.
