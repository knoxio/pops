# Epic: Tracking & Watchlist

**Theme:** Media
**Priority:** 3 (core user flow — depends on UI)
**Status:** Done

## Goal

Implement watchlist management and watch history tracking at episode-level granularity. This is the primary input mechanism — tracking what you've watched so the system can learn from it.

## Scope

### In scope

- **Watchlist management:**
  - Add movies and TV shows to the watchlist from library or search results
  - Remove from watchlist
  - Set priority (ordering within the watchlist)
  - Add optional notes ("Sarah recommended this", "wait for the Director's Cut")
  - Watchlist page (`/media/watchlist`) — ordered list of queued media
  - Auto-remove from watchlist when marked as watched (configurable)
- **Watch history — movies:**
  - Mark a movie as watched (sets watched_at timestamp)
  - Mark as unwatched (removes watch_history entry)
  - Re-watch support (multiple watch_history entries per movie)
  - Watched indicator on movie cards and detail pages
- **Watch history — TV shows:**
  - Mark individual episodes as watched/unwatched
  - Mark entire season as watched (batch operation)
  - Mark entire show as watched (batch operation)
  - Show progress indicator (e.g., "12/24 episodes watched")
  - Season progress indicator (e.g., "6/10")
  - "Next episode" indicator — which episode is next in the unwatched sequence
  - Episode watch toggles on the season detail page
- **Watch history page** (`/media/history`) — chronological log of everything watched, filterable by date range and type
- **UI updates:**
  - Watched/unwatched toggle on movie detail page
  - Episode watch toggles on season page
  - Progress bars on TV show cards and detail page
  - Watchlist button on all media cards and detail pages
  - Watchlist page with drag-to-reorder or manual priority

### Out of scope

- Plex-sourced watch history (Epic 6)
- Ratings or comparisons (Epic 4)
- Recommendations based on watch history (Epic 5)
- Watch time statistics or analytics
- "Currently watching" / in-progress tracking beyond episode count

## Deliverables

1. Watchlist CRUD operations via tRPC (add, remove, reorder, update notes)
2. Watch history CRUD operations via tRPC (mark watched, mark unwatched, batch operations)
3. Watchlist page with ordered media items and priority management
4. Watch history page with chronological log
5. Episode-level watch toggles on season detail page
6. Season and show-level batch watch operations
7. Progress indicators on TV show cards and detail pages
8. "Next episode" calculation for in-progress shows
9. Watched indicator on all movie cards
10. Unit tests for watch history logic (especially batch operations and progress calculation)
11. `mise db:seed` updated with watchlist entries and watch history — mix of watched/unwatched movies, partially-watched TV shows at various episode progress levels

## Dependencies

- Epic 0 (Data Model) — watchlist and watch_history tables
- Epic 2 (App Package & Core UI) — pages and components to extend

## Risks

- **Batch operation complexity** — "Mark season as watched" creates potentially 20+ watch_history rows in one operation. Mitigation: use a database transaction, insert all rows atomically.
- **Progress calculation performance** — Computing "12/24 episodes watched" for every show in the library grid requires joining across tv_shows → seasons → episodes → watch_history. Mitigation: either compute on demand with efficient queries (SQLite handles this fine at this scale) or cache progress as a denormalised field on the tv_shows row.
