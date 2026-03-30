# PRD-036: Watchlist

> Epic: [03 — Tracking & Watchlist](../../epics/03-tracking-watchlist.md)
> Status: Partial

## Overview

Build a prioritised list of movies and TV shows to watch next. Users add/remove items from detail pages and reorder by priority. Items auto-remove from the watchlist when marked as watched via manual actions (not Plex sync).

## Routes

| Route | Page |
|-------|------|
| `/media/watchlist` | Watchlist |

## UI Components

### Watchlist Page

| Element | Detail |
|---------|--------|
| Desktop layout | Poster grid with numbered priority badges |
| Mobile layout | Compact list with up/down reorder buttons |
| Filter tabs | All / Movies / TV Shows |
| Notes display | User notes shown below each item (e.g., "recommended by X") |
| Empty state | "Your watchlist is empty" with CTA to browse library or search |
| Loading state | Skeleton grid/list matching layout dimensions |

### Reorder Controls

| Platform | Mechanism |
|----------|-----------|
| Desktop | Drag-and-drop on poster cards |
| Mobile | Up/down arrow buttons beside each entry |

### Priority Badges

| Element | Detail |
|---------|--------|
| Badge position | Top-left corner of poster card |
| Badge content | Sequential number (1, 2, 3...) based on priority order |
| Badge style | Circular, solid background, contrasting text |

## API Dependencies

| Procedure | Usage |
|-----------|-------|
| `media.watchlist.list` | Fetch all watchlist items ordered by priority, enriched with media metadata |
| `media.watchlist.reorder` | Batch priority update after drag-and-drop or button reorder |
| `media.watchlist.remove` | Remove an item from the watchlist |
| `media.watchHistory.log` | Log a watch event (triggers auto-removal logic) |

## Business Rules

- Watchlist items are ordered by `priority` ASC, then `addedAt` DESC (newest first within same priority)
- No duplicate priorities allowed — reorder operation assigns sequential priorities in a single transaction
- Drag-and-drop (desktop) and up/down buttons (mobile) both call `watchlist.reorder` with the full ordered list
- Notes are optional free-text, set when adding to watchlist and editable after
- Auto-removal on manual watch:
  - **Movie:** removed from watchlist immediately when marked as watched (`completed=1`) via manual action
  - **TV show:** removed from watchlist only when ALL episodes across ALL seasons are marked as watched via manual action
  - **Plex sync:** watch events with `source="plex_sync"` do NOT trigger auto-removal — preserves the user's manual watchlist intent
- Undo toast on mark-as-watched does NOT re-add to watchlist — undo removes the watch event, the watchlist removal is a separate consequence

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Empty watchlist | Empty state with CTA to library and search |
| Reorder with single item | No-op, reorder controls hidden |
| Add item already on watchlist | No duplicate — existing entry unchanged |
| Auto-remove movie on watch | Movie disappears from watchlist, priority numbers re-sequence |
| Auto-remove TV show partially watched | Show stays on watchlist until every episode is completed |
| Plex sync marks movie as watched | Watchlist entry preserved (source="plex_sync" skips removal) |
| Undo mark-as-watched after auto-removal | Watch event deleted, but movie does NOT reappear on watchlist |
| Drag-and-drop cancelled mid-drag | List reverts to original order (no API call) |
| Very long notes text | Truncated in grid view, expandable on click or hover |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-watchlist-page](us-01-watchlist-page.md) | Watchlist page with responsive layout (grid desktop/list mobile), filter tabs, priority badges, notes display | Partial | Yes |
| 02 | [us-02-reorder](us-02-reorder.md) | Drag-and-drop reorder (desktop) and up/down buttons (mobile), batch priority update in transaction | Partial | Blocked by us-01 |
| 03 | [us-03-auto-removal](us-03-auto-removal.md) | Auto-remove from watchlist on manual watch completion, skip for plex_sync source | Partial | Yes (parallel with us-01) |

US-02 depends on US-01 (needs the watchlist grid/list to add reorder interactions). US-03 is backend logic and can be built independently.

## Verification

- Watchlist page renders at `/media/watchlist`
- Desktop shows poster grid with priority badges, mobile shows compact list
- Filter tabs switch between all, movies, TV shows
- Drag-and-drop reorders items on desktop
- Up/down buttons reorder items on mobile
- Priority badges update after reorder
- Notes display below items
- Movie auto-removes from watchlist when manually marked as watched
- TV show auto-removes only when all episodes are completed
- Plex sync watch events do not trigger auto-removal
- Empty state renders with CTAs when watchlist is empty

## Out of Scope

- Add/remove actions on detail pages (PRD-033, PRD-034 own the detail page actions)
- Plex sync integration (PRD-039)
- Watchlist sharing or export
