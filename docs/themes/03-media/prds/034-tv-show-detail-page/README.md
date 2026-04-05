# PRD-034: TV Show Detail Page

> Epic: [02 — App Package & Core UI](../../epics/02-app-package-ui.md)
> Status: Done

## Overview

Build the TV show detail page with season list and episode drill-down. Display show metadata, overall and per-season watch progress, season cards, and a separate season detail route with full episode lists and per-episode watch toggles.

## Routes

| Route | Page |
|-------|------|
| `/media/tv/:id` | Show detail with season list |
| `/media/tv/:id/season/:num` | Season detail with episode list |

## Layout — Show Detail (`/media/tv/:id`)

### Hero Section

| Element | Detail |
|---------|--------|
| Backdrop | Full-width background image; gradient overlay for readability; solid colour gradient fallback |
| Poster | Overlaid on the left side, 3-tier fallback chain |
| Title | Large heading |
| Year range | Start year – end year (or start year – "Present" if still airing) |
| Status | Airing status (Continuing, Ended, Upcoming) |
| Genres | Comma-separated or badge pills |
| Networks | Network/streaming service names (e.g., "HBO", "Netflix") |

### Overview Section

| Element | Detail |
|---------|--------|
| Overview | Full synopsis text from TheTVDB |

### Watch Progress

| Element | Detail |
|---------|--------|
| Overall progress bar | "X of Y episodes watched" with percentage |
| Bar colour | Green when 100%, accent colour otherwise |
| Next episode indicator | Badge on the next unwatched episode across all seasons |

### Season List

| Element | Detail |
|---------|--------|
| Season card | Season poster (or show poster fallback), season number, episode count, per-season progress % bar |
| Click target | Entire card — navigates to `/media/tv/:id/season/:num` |
| Sort order | Season number ascending; specials (season 0) listed last |

### Actions

| Action | Component | Detail |
|--------|-----------|--------|
| Watchlist | WatchlistToggle | Reuse from PRD-033 (accepts show ID) |
| Mark All Watched | Button | Batch-logs all unwatched episodes via `watchHistory.batchLog` |

## Layout — Season Detail (`/media/tv/:id/season/:num`)

### Season Header

| Element | Detail |
|---------|--------|
| Season poster | Season-specific poster or show poster fallback |
| Season name | "Season N" or custom name if set |
| Overview | Season-level synopsis (hidden if empty) |
| Air date | Season premiere date |

### Episode List

| Element | Detail |
|---------|--------|
| Row layout | Episode number, name, air date, runtime, watch status indicator |
| Watch indicator | Checkmark icon if watched, empty circle if not |
| Per-episode toggle | Clicking the indicator toggles watched/unwatched for that episode |
| "Mark Season Watched" button | Batch-logs all unwatched episodes in this season |

## API Dependencies

| Procedure | Usage |
|-----------|-------|
| `media.library.getTvShow` | Fetch full show metadata with season list |
| `media.library.getSeason` | Fetch season metadata with episode list |
| `media.watchHistory.progress` | Get overall + per-season watch stats for a show |
| `media.watchHistory.log` | Log a single episode watch event |
| `media.watchHistory.delete` | Delete a single episode watch event (toggle unwatched) |
| `media.watchHistory.batchLog` | Log watch events for multiple episodes at once |
| `media.watchlist.status` | Check if show is on watchlist |
| `media.watchlist.add` | Add show to watchlist |
| `media.watchlist.remove` | Remove show from watchlist |

## Business Rules

- Year range displays as "Start – End" for ended shows, "Start – Present" for continuing shows, "Start" only for single-season shows that have ended
- Watch progress is calculated from `watchHistory.progress(tvShowId)` which returns both overall and per-season breakdowns
- "Next episode" is the first unwatched episode in air-date order across all seasons
- "Mark All Watched" and "Mark Season Watched" use `batchLog` — a single API call, not one per episode
- Per-episode watch toggle is optimistic — the checkmark appears/disappears immediately
- Specials (season 0) are listed last in the season list, not first
- Season detail page shows episode air dates; episodes that have not aired yet are visually distinct (dimmed, "Upcoming" label)

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Show not found (invalid ID) | 404 page or redirect to library |
| Season not found (invalid number) | 404 page or redirect to show detail |
| Show with no seasons | Empty season list with message ("No seasons available") |
| Season with no episodes | Empty episode list with message ("No episodes available") |
| All episodes watched | Progress bar at 100% (green), "Mark All Watched" button hidden or disabled |
| Episode has not aired yet | Dimmed row, "Upcoming" label, watch toggle disabled |
| Show still airing (new episodes) | Progress denominator updates as new episodes are added via metadata refresh |
| Batch mark watched fails | Revert optimistic updates for all affected episodes, error toast |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-show-hero-metadata](us-01-show-hero-metadata.md) | Hero layout with backdrop, poster, title, year range, status, genres, networks, overview | Done | No (first) |
| 02 | [us-02-season-list](us-02-season-list.md) | Season cards with poster, number, episode count, per-season progress bar, click to season detail | Done | Blocked by us-01 |
| 03 | [us-03-season-detail-page](us-03-season-detail-page.md) | Season detail route, episode list with watch status toggles, mark season watched | Done | Yes (parallel with us-02) |
| 04 | [us-04-watch-progress](us-04-watch-progress.md) | Watch progress display (overall + per-season bars), next episode indicator, batch mark watched | Done | Yes (parallel with us-02) |

US-02 depends on US-01 (needs the page shell). US-03 and US-04 are independent components that can be built in parallel with US-02 after the route structure is established.

## Verification

- Hero section renders with all show metadata
- Year range formats correctly for ended, continuing, and single-season shows
- Season list displays all seasons with correct episode counts and progress bars
- Clicking a season card navigates to the season detail page
- Season detail page lists all episodes with correct watch status
- Per-episode watch toggle updates optimistically
- "Mark Season Watched" batch-logs all unwatched episodes in one call
- "Mark All Watched" batch-logs all unwatched episodes across all seasons
- Next episode indicator points to the correct episode
- Overall progress bar updates after watch events
- Specials listed last, unaired episodes are dimmed and non-toggleable

## Out of Scope

- Editing show/season/episode metadata
- Removing a show from the library
- Cast/crew information
- Episode ratings or comparisons
- Recommendations for similar shows (Epic 05)
