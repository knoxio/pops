# PRD-033: Movie Detail Page

> Epic: [02 — App Package & Core UI](../../epics/02-app-package-ui.md)
> Status: Partial

## Overview

Build the movie detail page — a full metadata view with hero backdrop, poster, actions (watchlist toggle, mark as watched), and optional comparison scores. This page is the primary interaction point for a single movie in the library.

## Routes

| Route | Page |
|-------|------|
| `/media/movies/:id` | Movie detail |

## Layout

### Hero Section

| Element | Detail |
|---------|--------|
| Backdrop | Full-width background image from TMDB; gradient overlay for text readability. Falls back to a solid colour gradient if no backdrop exists |
| Poster | Overlaid on the left side of the hero, same 3-tier fallback as MediaCard |
| Title | Large heading over the backdrop |
| Year | Release year next to or below the title |
| Runtime | Formatted as "Xh Ym" (e.g., "2h 15m") |
| Genres | Comma-separated genre list or badge pills |

### Overview Section

| Element | Detail |
|---------|--------|
| Tagline | Italic text above the overview (hidden if empty) |
| Overview | Full synopsis text from TMDB |

### Metadata Grid

| Field | Detail |
|-------|--------|
| Status | Release status (Released, In Production, etc.) |
| Original Language | ISO 639-1 code displayed as full language name |
| Budget | Formatted currency (hidden if zero/null) |
| Revenue | Formatted currency (hidden if zero/null) |
| TMDB Rating | Vote average and vote count from TMDB community |

### Actions

| Action | Component | Detail |
|--------|-----------|--------|
| Watchlist | WatchlistToggle | Add/remove from watchlist with optimistic update |
| Watch | MarkAsWatchedButton | Log a watch event, undo toast, auto-remove from watchlist |

### Comparison Scores (Conditional)

| Element | Detail |
|---------|--------|
| Radar chart | Shows Elo score per active comparison dimension |
| Visibility | Only rendered if the movie has been compared at least once; hidden otherwise |
| Scale | Scores normalised to 0-100 from the Elo range for radar display |

### Watch History

| Element | Detail |
|---------|--------|
| Watch list | Chronological list of watch dates for this movie |
| Empty state | "Not watched yet" if no watch events exist |

## API Dependencies

| Procedure | Usage |
|-----------|-------|
| `media.library.getMovie` | Fetch full movie metadata by ID |
| `media.watchlist.status` | Check if movie is on watchlist |
| `media.watchlist.add` | Add to watchlist |
| `media.watchlist.remove` | Remove from watchlist |
| `media.watchHistory.log` | Log a watch event (completed=1) |
| `media.watchHistory.delete` | Delete a watch event (for undo) |
| `media.watchHistory.list` | Get watch history for this movie |
| `media.comparisons.scores` | Get comparison scores per dimension for this movie |

## Business Rules

- Movie detail page renders all available metadata; fields with null/zero values are hidden (not shown as "N/A")
- WatchlistToggle uses optimistic updates — UI changes immediately, reverts on API failure
- MarkAsWatchedButton logs a watch event with `completed=1` and the current timestamp
- After logging a watch, the movie is automatically removed from the watchlist (server-side side effect)
- Undo toast appears for 5 seconds after marking as watched; clicking undo deletes the watch event and re-adds to watchlist if previously on it
- Comparison scores section is completely hidden (not rendered at all) when the movie has zero comparisons
- Radar chart normalises Elo scores to a 0-100 scale for visual consistency

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Movie not found (invalid ID) | 404 page or redirect to library |
| No backdrop image | Hero section uses a solid colour gradient derived from the poster's dominant colour (or a default) |
| No tagline | Tagline element is not rendered |
| Budget/revenue is zero | Those fields are hidden from the metadata grid |
| Movie watched multiple times | Watch history lists all dates; each watch is a separate event |
| Undo clicked after toast expires | No action — the toast is dismissed and the watch event persists |
| Optimistic watchlist update fails | UI reverts to previous state, error toast displayed |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-movie-hero-metadata](us-01-movie-hero-metadata.md) | Hero layout with backdrop, poster, title/year/runtime/genres, overview, metadata grid | Partial | No (first) |
| 02 | [us-02-watchlist-toggle](us-02-watchlist-toggle.md) | WatchlistToggle component with optimistic add/remove, state detection | Partial | Yes (parallel with us-01) |
| 03 | [us-03-mark-as-watched](us-03-mark-as-watched.md) | MarkAsWatchedButton with watch logging, undo toast, watchlist auto-removal | Partial | Yes (parallel with us-01) |
| 04 | [us-04-comparison-scores](us-04-comparison-scores.md) | ComparisonScores radar chart, conditional display, score normalisation | Partial | Yes (parallel with us-01) |

US-01 builds the page shell. US-02, US-03, and US-04 are independent components that can all be built in parallel with each other and integrated into the page.

## Verification

- Hero section renders backdrop, poster, title, year, runtime, genres
- Tagline and overview display correctly; tagline hidden when empty
- Metadata grid hides zero/null fields
- WatchlistToggle reflects current state and optimistically updates
- MarkAsWatchedButton logs event, shows undo toast, auto-removes from watchlist
- Comparison scores radar chart renders when comparisons exist, hidden when none
- Watch history lists all watch dates
- 404 handling works for invalid movie IDs

## Out of Scope

- Editing movie metadata
- Deleting a movie from the library
- Cast/crew information (future enhancement)
- Similar movies recommendations (Epic 05)
- External links (TMDB page, streaming availability)
