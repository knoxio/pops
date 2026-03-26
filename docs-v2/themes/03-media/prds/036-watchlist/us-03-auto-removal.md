# US-03: Watchlist auto-removal

> PRD: [036 — Watchlist](README.md)
> Status: Partial

## Description

As a user, I want items to auto-remove from my watchlist when I've finished watching them so that my watchlist stays current without manual cleanup.

## Acceptance Criteria

- [x] When a movie is logged as watched with `completed=1` via manual action, it is automatically removed from the watchlist
- [x] When an episode is logged as watched with `completed=1`, the system checks if ALL episodes across ALL seasons of the parent TV show are now completed
- [x] If all episodes of a TV show are completed, the TV show is removed from the watchlist
- [x] If any episode of a TV show remains unwatched, the TV show stays on the watchlist
- [x] Watch events with `source="plex_sync"` do NOT trigger auto-removal — the watchlist entry is preserved
- [ ] After auto-removal, remaining watchlist items re-sequence priorities (no gaps)
- [x] Undo of a mark-as-watched action deletes the watch event but does NOT re-add the item to the watchlist
- [x] Auto-removal and watch event logging happen in the same database transaction
- [x] If the item is not on the watchlist when marked as watched, no error occurs (no-op for removal)
- [ ] Tests cover: movie auto-removal on watch, TV show removal when all episodes watched, TV show retained when partially watched, plex_sync skips removal, priority re-sequencing after removal, undo does not re-add, no-op when item not on watchlist

## Notes

This is backend logic inside the `watchHistory.log` procedure. The source field on watch events distinguishes manual watches (which trigger auto-removal) from Plex sync watches (which do not). The undo behaviour is intentional — once an item is removed from the watchlist, the undo only affects the watch event, not the watchlist state. This avoids complex state reversal across two tables.
