# PRD-011: Watchlist Management

**Epic:** [03 — Tracking & Watchlist](../themes/media/epics/03-tracking-watchlist.md)
**Theme:** Media
**Status:** Draft

## Problem Statement

Users need a way to queue media they intend to watch. Without a watchlist, the only options are remembering titles mentally or using external tools. The watchlist is a core input to the "what should I watch tonight?" flow in Epic 5.

## Goal

A dedicated watchlist page where users can add, remove, reorder, and annotate media they want to watch. Movies and TV shows can be added to the watchlist from library detail pages, search results, or the watchlist page itself.

## Requirements

### R1: Watchlist Page (`/media/watchlist`)

**Layout:**
- Ordered list of watchlist items (sorted by priority, then added date)
- Each item shows:
  - Poster thumbnail (from local cache)
  - Title, year, type badge
  - Notes (if any — shown as small text below title)
  - Priority indicator or position number
  - "Remove" action (icon button)
  - Click → navigate to detail page
- Drag-to-reorder or up/down buttons for priority management
- Empty state: "Your watchlist is empty. Browse your library or search for something to watch."

**Data source:** `media.watchlist.list` tRPC query

### R2: Add to Watchlist

Available from multiple entry points:

| Entry point | Interaction |
|-------------|-------------|
| Movie detail page | "Add to Watchlist" button in actions area |
| TV show detail page | "Add to Watchlist" button in actions area |
| Library page (MediaCard) | Context menu or icon button on hover |
| Search results | "Add to Watchlist" after adding to library |

**Behaviour:**
- Calls `media.watchlist.add({ mediaType, mediaId })`
- Button toggles to "On Watchlist" / "Remove from Watchlist" when already added
- Default priority: 0 (end of list)
- Optional notes prompt on add (or add notes later via edit)
- Toast notification on success: "[Title] added to watchlist"

### R3: Remove from Watchlist

- Calls `media.watchlist.remove({ mediaType, mediaId })`
- Available from: watchlist page (remove button), detail page (toggle button)
- No confirmation dialog — removal is easily undone by re-adding
- Toast notification: "[Title] removed from watchlist"

### R4: Reorder Watchlist

Users should be able to prioritise what to watch next.

**Implementation — pick one:**
- **Drag-to-reorder** (preferred on desktop) — drag handle on each item, reorder updates priority values
- **Up/down buttons** (mobile-friendly) — arrow buttons on each item

Both call `media.watchlist.updatePriority({ id, priority })`. The priority is a sortable integer — lower values appear first. On reorder, re-index all items to maintain sequential priorities (0, 1, 2, ...).

### R5: Watchlist Notes

Optional text notes on watchlist items — "Sarah recommended this", "wait for Director's Cut", "watch with partner."

- Add/edit via inline text input on the watchlist page or a small modal
- Calls `media.watchlist.updateNotes({ id, notes })`
- Notes displayed as muted text below the title
- Empty notes = no notes section shown

### R6: Auto-remove on Watch (configurable)

When a movie is marked as watched (Epic 3 / PRD-012), optionally remove it from the watchlist automatically.

- Default behaviour: auto-remove on watch
- The auto-remove logic lives in the watch history service — when logging a watch event for a movie, check if it's on the watchlist and remove it
- For TV shows: auto-remove when the entire show is marked as watched (all episodes), not on individual episode watches

### R7: Watchlist Count Badge

Display the watchlist count in the media app's navigation:
- "Watchlist (5)" in the secondary nav
- Badge count updates reactively when items are added/removed

## Out of Scope

- Smart watchlist suggestions ("you might want to add this")
- Shared watchlists (future idea)
- Multiple watchlists or custom lists
- Watchlist import/export
- Due dates or "watch by" deadlines

## Acceptance Criteria

1. Watchlist page displays all watchlist items sorted by priority
2. Items can be added from movie detail, TV show detail, library cards, and search results
3. Add button toggles to remove state when item is already on watchlist
4. Items can be reordered via drag or up/down controls
5. Notes can be added and edited inline
6. Items can be removed from the watchlist page and detail pages
7. Auto-remove on watch works for movies (immediate) and TV shows (all episodes watched)
8. Watchlist count badge shown in navigation
9. Empty state shown when watchlist is empty
10. All actions show toast notifications
11. Page is responsive at 375px, 768px, 1024px
12. `mise db:seed` updated with 3-4 watchlist entries
13. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes. All stories in this PRD are parallelisable.

#### US-1: Watchlist page
**Scope:** Create `WatchlistPage.tsx`. Ordered list by priority. Each item: poster, title, year, type badge, notes. Click navigates to detail page. Empty state with CTA. Add route to `routes.tsx`. Add "Watchlist" to secondary nav with count badge.
**Files:** `packages/app-media/src/pages/WatchlistPage.tsx`

#### US-2: Add/remove watchlist toggle
**Scope:** Add "Add to Watchlist" / "On Watchlist" toggle button to `MovieDetailPage`, `TvShowDetailPage`, and `MediaCard` (hover/context). Calls `media.watchlist.add` / `media.watchlist.remove`. Toast notifications on success.
**Files:** `MovieDetailPage.tsx`, `TvShowDetailPage.tsx`, `MediaCard.tsx`

#### US-3: Watchlist reorder
**Scope:** Add drag-to-reorder (desktop) or up/down buttons (mobile) to the watchlist page. On reorder, re-index all affected items' priority values via `media.watchlist.updatePriority`. Persist after reload.
**Files:** `WatchlistPage.tsx`

#### US-4: Watchlist notes
**Scope:** Add inline notes editing to watchlist items. Click to add/edit, muted text display below title, empty notes hidden. Calls `media.watchlist.updateNotes`.
**Files:** `WatchlistPage.tsx`

#### US-5: Auto-remove on watch
**Scope:** In the watch history service (`modules/media/watch-history/service.ts`), add logic: when logging a movie watch event, check if the movie is on the watchlist and remove it. For TV shows, remove from watchlist only when all episodes are marked watched. Individual episode watches do not trigger removal. Unit tests.
**Files:** `modules/media/watch-history/service.ts`, test
