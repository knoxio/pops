# PRD-012: Watch History & Tracking

**Epic:** [03 — Tracking & Watchlist](../themes/media/epics/03-tracking-watchlist.md)
**Theme:** Media
**Status:** Draft

## Problem Statement

The media app needs to know what the user has watched. Without watch tracking, the comparison system (Epic 4) has no pool to draw from, the recommendation engine (Epic 5) has no signal, and the user can't tell at a glance what they've seen. Watch history is the core input to every downstream feature.

## Goal

Users can mark movies as watched/unwatched, track TV show progress at the episode level, and view a chronological log of everything watched. The UI integrates watch toggles into existing detail pages and adds a history page.

## Requirements

### R1: Movie Watch Toggle

On the movie detail page (PRD-010 R5), activate the "Mark as Watched" button:

**States:**
- **Unwatched:** "Mark as Watched" button → calls `media.watchHistory.log({ mediaType: 'movie', mediaId })`
- **Watched:** "Watched ✓" indicator with a "Mark Unwatched" action → calls `media.watchHistory.remove({ id })` (removes the most recent watch event)

**Re-watch support:** If already watched, show "Watch Again" alongside "Watched ✓". Clicking "Watch Again" logs a new watch event without removing the previous one.

**Visual feedback:**
- Watched movies show a checkmark overlay on their `MediaCard` in the library grid
- Watch date shown on the detail page: "Watched on Mar 15, 2026"
- Multiple watches shown: "Watched 3 times — last on Mar 15, 2026"

### R2: Episode Watch Toggles

On the season detail page (PRD-010 R7), activate the watch toggles per episode:

**Per-episode toggle:**
- Checkbox or toggle next to each episode
- Checked = watched, calls `media.watchHistory.log({ mediaType: 'episode', mediaId: episodeId })`
- Unchecked = unwatched, calls `media.watchHistory.remove({ id })`

**Batch operations:**
- "Mark Season as Watched" button — calls `media.watchHistory.batchLog` for all unwatched episodes in the season
- "Mark Season as Unwatched" button — removes all watch events for episodes in the season
- "Mark All as Watched" on the TV show detail page — batch marks every episode in every season

All batch operations use a database transaction (handled in the service layer).

### R3: TV Show Progress Indicators

Activate the progress placeholders from PRD-010:

**On the TV show detail page:**
- Progress bar showing watched/total episodes: "12 / 24 episodes"
- Per-season progress in the season list: "6 / 10" next to each season

**On MediaCard (library grid):**
- Mini progress bar at the bottom of TV show cards
- Or text: "3/10" in small muted text

**"Next episode" indicator:**
- On the TV show detail page, highlight the next unwatched episode in sequence
- "Continue watching: S02E05 — [Episode Name]" with a direct link to the season page

**Data source:** `media.watchHistory.getProgress({ tvShowId })` tRPC query

### R4: Watch History Page (`/media/history`)

A chronological log of everything watched.

**Layout:**
- Reverse-chronological list (most recent first)
- Each entry shows: poster thumbnail, title, type badge, watched date
- For episodes: show name + episode identifier (S01E05) + episode name
- Filterable by type (All / Movies / TV Episodes)
- Filterable by date range (this week, this month, this year, custom)
- Paginated or infinite scroll

**Data source:** `media.watchHistory.listRecent` tRPC query

### R5: Watch Date Override

By default, `watched_at` is set to the current timestamp. Users should be able to set a custom watch date for media watched in the past:

- On the movie detail page: "Mark as Watched" has an optional date picker (defaulting to today)
- On episode toggles: batch operations use current timestamp. Individual episodes can have date overrides via the history page.

Calls `media.watchHistory.log({ mediaType, mediaId, watchedAt: '2026-01-15' })`

### R6: Integration with Watchlist

Per PRD-011 R6:
- When a movie is marked as watched, auto-remove from watchlist
- When all episodes of a TV show are marked as watched, auto-remove from watchlist
- This logic lives in the watch history service layer

### R7: Route Addition

Add to `@pops/app-media/routes`:
```typescript
{ path: 'history', element: <HistoryPage /> }
```

URL: `/media/history`

Add "History" to the media app's secondary navigation, after "Watchlist."

## Out of Scope

- Plex-sourced watch history (PRD-015)
- Watch time statistics or "year in review" dashboards
- "Currently watching" real-time status
- Social sharing of watch activity
- Watch streaks or gamification

## Acceptance Criteria

1. Movie watch toggle works: mark watched, mark unwatched, watch again
2. Watched movies show checkmark overlay in library grid
3. Episode watch toggles work: individual toggle, mark season, mark show
4. TV show progress bars display correct watched/total counts
5. "Next episode" indicator correctly identifies the next unwatched episode in sequence
6. Watch history page displays all watches in reverse-chronological order
7. History page filtering works: by type and date range
8. Custom watch date works for backdating watches
9. Auto-remove from watchlist on movie watch and full TV show watch
10. Batch operations complete atomically (all-or-nothing)
11. Re-watch logging works without removing previous watch events
12. All pages responsive at 375px, 768px, 1024px
13. `mise db:seed` updated with watch history data: mix of watched/unwatched movies, partially-watched TV shows
14. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes. All stories are parallelisable.

#### US-1: Movie watch toggle
**Scope:** Add "Mark as Watched" / "Watched ✓" / "Watch Again" button to `MovieDetailPage`. Calls `media.watchHistory.log` / `media.watchHistory.remove`. Show watch date on detail page. Multiple watches displayed: "Watched 3 times — last on Mar 15, 2026". Add checkmark overlay to `MediaCard` for watched movies.
**Files:** `MovieDetailPage.tsx`, `MediaCard.tsx`

#### US-2: Episode watch toggles
**Scope:** Add checkbox/toggle per episode on `SeasonDetailPage` via `EpisodeList` component. Checked = watched, unchecked = unwatched. Each toggle calls `media.watchHistory.log` / `remove` for that episode ID.
**Files:** `SeasonDetailPage.tsx`, `EpisodeList.tsx`

#### US-3: Batch watch operations
**Scope:** Add "Mark Season as Watched" / "Mark Season as Unwatched" buttons to `SeasonDetailPage`. Add "Mark All as Watched" to `TvShowDetailPage`. Calls `media.watchHistory.batchLog`. All operations atomic (single transaction in service layer).
**Files:** `SeasonDetailPage.tsx`, `TvShowDetailPage.tsx`

#### US-4: TV show progress indicators
**Scope:** Add progress bar to `TvShowDetailPage` ("12 / 24 episodes"). Add per-season progress in season list ("6 / 10"). Add mini progress indicator to `MediaCard` for TV shows. Add "Next episode" indicator with link ("Continue watching: S02E05 — [name]"). Data from `media.watchHistory.getProgress`.
**Files:** `TvShowDetailPage.tsx`, `MediaCard.tsx`

#### US-5: Watch history page
**Scope:** Create `HistoryPage.tsx`. Reverse-chronological list of all watch events. Movies show poster + title + date. Episodes show show name + S01E05 + episode name + date. Filter by type (All/Movies/Episodes) and date range. Paginated or infinite scroll. Add route + "History" to secondary nav.
**Files:** `packages/app-media/src/pages/HistoryPage.tsx`

#### US-6: Custom watch date
**Scope:** Add optional date picker to the "Mark as Watched" action on `MovieDetailPage` (defaults to today). Passes `watchedAt` to `media.watchHistory.log`. History page displays the custom date.
**Files:** `MovieDetailPage.tsx`
