# PRD-035: Watch History

> Epic: [03 — Tracking & Watchlist](../../epics/03-tracking-watchlist.md)
> Status: Partial

## Overview

Track what's been watched at movie and episode level. Build a chronological history page with type filters and pagination. Provide mark-as-watched actions on detail pages with undo toast support.

## Routes

| Route | Page |
|-------|------|
| `/media/history` | Watch History |

## UI Components

### History Page

| Element | Detail |
|---------|--------|
| Filter tabs | All / Movies / Episodes |
| History list | Chronological, most recent first |
| Entry row | Poster thumbnail, title, watched date |
| Episode entry | Show name + S01E03 format, links to show detail and season detail |
| Pagination | Page-based with page size selector |
| Empty state | "Nothing watched yet" with CTA to browse library |
| Loading state | Skeleton list matching entry row dimensions |

### Entry Row Layout

| Element | Detail |
|---------|--------|
| Poster thumbnail | Small (60x90), same 3-tier fallback as MediaCard |
| Title | Movie title or episode name |
| Subtitle | For episodes: "Show Name — S01E03" with links to show and season |
| Watched date | Relative ("2 days ago") with full date on hover/tooltip |
| Delete action | Icon button, visible on hover (desktop) or swipe (mobile) |

## API Dependencies

| Procedure | Usage |
|-----------|-------|
| `media.watchHistory.listRecent` | Fetch paginated watch events enriched with media metadata (title, poster, show name for episodes) |
| `media.watchHistory.delete` | Remove a watch event |

## Business Rules

- Multiple watch events per item are allowed (re-watches tracked individually)
- Unique constraint on (mediaType, mediaId, watchedAt) prevents exact duplicate timestamps
- `completed` flag (0 or 1) — only completed watches (`completed=1`) appear on the history page
- Watch events include: title, posterUrl, watchedAt, mediaType, seasonNumber/episodeNumber for episodes
- Deleting a watch event is permanent — used for correcting mistakes, not undoing a watch
- History page only shows completed watches; in-progress events are filtered out

## Edge Cases

| Case | Behaviour |
|------|-----------|
| No watch history | Empty state with CTA to library |
| Episode with missing show data | Display episode title only, omit show name link |
| Re-watch of same item | New entry in history (same item, different watchedAt) |
| Delete last watch event for a movie | Movie no longer appears in history but stays in library |
| Very long show/episode names | Truncated with ellipsis, full name on hover |
| Filter returns no results | "No [movies/episodes] watched yet" message matching active filter |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-history-page](us-01-history-page.md) | History page with chronological list, filter tabs (All/Movies/Episodes), pagination, poster/title/date display | Done | Yes |
| 02 | [us-02-episode-enrichment](us-02-episode-enrichment.md) | Episode entries show show name, season/episode numbers (S01E03), link to show and season detail pages | Done | Blocked by us-01 |
| 03 | [us-03-delete-watch-event](us-03-delete-watch-event.md) | Delete watch event action with confirmation, for correcting mistakes | Partial | Yes (parallel with us-01) |

US-02 depends on US-01 (needs the history list to add episode-specific rendering). US-03 can be built in parallel with US-01 (independent delete interaction).

## Verification

- History page renders at `/media/history`
- Entries are ordered most recent first
- Filter tabs switch between all, movies only, episodes only
- Pagination navigates through pages correctly
- Episode entries show show name and S01E03 format
- Episode entries link to show detail and season detail pages
- Delete action removes an entry from the list
- Empty state renders when no watch history exists
- Only completed watches appear in the list

## Out of Scope

- Mark-as-watched action on detail pages (PRD-033, PRD-034 own the detail page actions)
- Undo toast for mark-as-watched (lives on the detail page, not the history page)
- Plex watch history sync (PRD-039)
- In-progress / "continue watching" tracking
