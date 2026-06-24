# Watch History

Status: Done — chronological history page at `/media/history` over the media pillar's REST `watch-history` contract, with type filtering, offset pagination, episode enrichment, and delete-with-confirmation. (Several originally-specced details — a `completed=1`-only filter, URL-query state, a page-size selector, relative timestamps, and swipe-to-delete — are NOT built; see `../../ideas/watch-history-page-polish.md`.)

## Purpose

Track what's been watched at movie and episode level and surface it as a chronological "what have I seen recently" page. Watch events are also written by detail-page mark-as-watched actions and Plex sync; this PRD owns only the read/history surface and the corrective delete.

## Data Model

`watch_history` (media pillar SQLite):

| Column        | Type                            | Notes                                             |
| ------------- | ------------------------------- | ------------------------------------------------- |
| `id`          | integer PK autoincrement        |                                                   |
| `media_type`  | text enum `movie` \| `episode`  | `media_id` is a movie row id or an episode row id |
| `media_id`    | integer                         | not a tmdb/tvdb external id                       |
| `watched_at`  | text, default `datetime('now')` | second-precision UTC `YYYY-MM-DD HH:MM:SS`        |
| `completed`   | integer, default `1`            | 0/1 flag                                          |
| `blacklisted` | integer, default `0`            | 0/1, used by other domains                        |

Indexes: `(media_type, media_id)`, `(watched_at)`, and a **unique** index on `(media_type, media_id, watched_at)`.

- [x] Re-watches are first-class: multiple rows per item are allowed, distinguished by `watched_at`.
- [x] The unique index rejects two events for the same item in the same second; the service raises a conflict error carrying the resolved timestamp.

## REST API Surface

ts-rest contract `watch-history.*`, base path `/watch-history`. The history page consumes only `listRecent` and `delete`; the rest exist for detail-page and sync callers.

| Method & path                           | Purpose                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `GET /watch-history/recent`             | Paginated, **enriched** entries for the history page         |
| `GET /watch-history`                    | Paginated raw entries (filters: `mediaType`, `mediaId`)      |
| `GET /watch-history/:id`                | Single raw entry                                             |
| `GET /watch-history/progress/:tvShowId` | Per-season + overall progress + next episode for a show      |
| `POST /watch-history/batch-progress`    | Completion percentage for a batch of show ids                |
| `POST /watch-history`                   | Log a watch event (auto-removes the item from the watchlist) |
| `POST /watch-history/batch`             | Batch-log all aired episodes of a season or show             |
| `DELETE /watch-history/:id`             | Delete a single event                                        |

`listRecent` query: `mediaType?` (`movie`|`episode`), `startDate?`, `endDate?` (ISO datetime), `limit?` (≤500), `offset?`. Ordered `watched_at DESC`. Response is `{ data: RecentEntry[], pagination }`.

`RecentEntry` enriches each row per-row (movie → `movies`; episode → `episodes` → `seasons` → `tv_shows`): `id, mediaType, mediaId, watchedAt, completed, title, posterPath, posterUrl, seasonNumber, episodeNumber, showName, tvShowId` (all enrichment fields nullable).

- [x] `posterUrl` resolves to the row's `posterOverridePath`, else the pillar's `/media/images/{movie|tv}/{externalId}/poster.jpg` byte route keyed by the **external** (tmdb/tvdb) id — never the DB id. That byte route serves `MEDIA_IMAGES_DIR` directly (Express static/proxy) and is NOT part of the ts-rest contract.
- [x] `DELETE /watch-history/:id` is hard-delete; a missing id maps to a 404 `NotFoundError`.

## UI

Route `/media/history` (label "History"). Page-level state (`filter`, `offset`) is in-memory React state.

- [x] Filter tabs **All / Movies / Episodes** (pill buttons); changing the filter resets `offset` to 0.
- [x] Entries render `watched_at DESC` (server-ordered).
- [x] Responsive: a list (`HistoryItem`) on mobile, a poster-card grid (`HistoryCard`) on desktop (≥md).
- [x] Each entry links to its detail target: movie → `/media/movies/:mediaId`; episode → `/media/tv/:tvShowId/season/:seasonNumber` (falls back to `/media` when `tvShowId` is missing).
- [x] Poster thumbnail at `aspect-[2/3]` with a muted placeholder / `Film` icon when `posterUrl` is null or the image errors.
- [x] Watched date renders as an absolute locale date-time (`HistoryItem`) / short date badge (`HistoryCard`).
- [x] Empty state shows a filter-specific message ("No watch history yet…" / "No movies in your history." / "No episodes in your history.") plus a "Browse library" link to `/media`.
- [x] Loading state renders skeleton rows/cards matching the entry layout.

### Episode enrichment

- [x] Episode entries show a subtitle "{showName} — S{NN}E{NN}" via `formatEpisodeCode` (both numbers zero-padded to 2 digits, e.g. `S02E10`).
- [x] Show name links to `/media/tv/:tvShowId`; the episode code links to `/media/tv/:tvShowId?season=:seasonNumber`.
- [x] Movie entries render title only — no subtitle.
- [x] Graceful degradation: when enrichment is incomplete (`showName`/`seasonNumber`/`episodeNumber` null), the episode renders with its own title only and no subtitle.

### Delete

- [x] Each entry has a delete icon button (desktop card: visible on hover via `group-hover`; mobile list: always present). No swipe gesture.
- [x] Clicking it opens an `AlertDialog`: "Remove watch event? … This cannot be undone."
- [x] Confirming calls `DELETE /watch-history/:id`; on success a success toast fires and the `['media','watchHistory']` + `['media','watchlist']` query caches are invalidated (list refetches).
- [x] On error a toast shows "Failed to delete watch event: …" and the entry stays.
- [x] The button is disabled while a delete is in flight (prevents double-submit).
- [x] Deleting the last entry on a non-first page steps `offset` back one page.

### Pagination

- [x] Offset/limit pagination at a fixed page size of 50, with Previous/Next buttons and a "Showing N of M" count. Next is shown only when `offset + 50 < total`; Previous only when `offset > 0`.

## Business Rules

- [x] Delete is permanent and intended for correcting mistakes (e.g. an accidental mark-as-watched), not as an "undo watched" flow. Deleting a movie's only event removes it from history but leaves it in the library.
- [x] Logging a watch auto-removes the item from the watchlist (owned by `POST /watch-history`).

## Edge Cases

- [x] No history → empty state with library CTA.
- [x] Episode with missing show data → episode title only, no show/season links.
- [x] Re-watch → a new row (same item, different `watched_at`).
- [x] Long titles/names truncate with ellipsis.
- [x] Active filter with no results → the filter-specific empty message.

## Out of Scope

- Mark-as-watched actions + undo toast on detail pages (owned by the movie/TV detail PRDs).
- Plex watch-history sync (its own PRD).
- In-progress / "continue watching" tracking.
