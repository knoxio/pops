# TV Show Detail Page

Status: Partial — show-detail + season-detail pages, hero, season list, episode toggles, and watch progress are all shipped. Missing vs. the original scope: a watchlist toggle on the show page and per-season poster thumbnails in the season list (both moved to `docs/ideas/tv-show-detail-watchlist-and-season-posters.md`). A Sonarr monitoring layer ships on both pages beyond the original scope.

## Purpose

Browse a TV show in the library: full metadata hero, season list with per-season progress, and a drill-down season route with a per-episode watch list. Track overall and per-season watch progress, toggle episodes watched/unwatched, and batch-mark a whole season or show as watched.

## Routes

| Route                       | Page                            |
| --------------------------- | ------------------------------- |
| `/media/tv/:id`             | Show detail with season list    |
| `/media/tv/:id/season/:num` | Season detail with episode list |

`:id` is the local TV-show row id; `:num` is the `seasonNumber` (0 = Specials), not the season row id.

## Data Model (wire shapes)

- **TvShow** — `id`, `tvdbId`, `name`, `originalName`, `overview`, `firstAirDate`, `lastAirDate`, `status`, `originalLanguage`, `numberOfSeasons`, `numberOfEpisodes`, `posterUrl`/`backdropUrl`/`logoUrl` (+ raw `*Path` + `posterOverridePath`), `voteAverage`, `voteCount`, `genres[]`, `networks[]`.
- **Season** — `id`, `tvShowId`, `tvdbId`, `seasonNumber`, `name`, `overview`, `posterUrl`, `airDate`, `episodeCount`.
- **Episode** — `id`, `seasonId`, `tvdbId`, `episodeNumber`, `name`, `overview`, `airDate`, `stillPath`, `voteAverage`, `runtime`.
- **TvShowProgress** — `overall { watched, total, percentage }`, `seasons[] { seasonId, seasonNumber, watched, total, percentage }`, `nextEpisode { seasonNumber, episodeNumber, episodeName } | null`.

Image URLs (`posterUrl`, `backdropUrl`, season `posterUrl`) resolve to the `/media/images/...` byte route, which serves `MEDIA_IMAGES_DIR` directly (Express static/proxy with CDN fallback) and is **not** part of the ts-rest contract.

## REST API Surface (media pillar)

| Method & path                           | Use                                                        |
| --------------------------------------- | ---------------------------------------------------------- |
| `GET /tv-shows/:id`                     | Show metadata for the hero + overview                      |
| `GET /tv-shows/:tvShowId/seasons`       | Season rows for the season list                            |
| `GET /seasons/:seasonId/episodes`       | Episode rows for the season detail page                    |
| `GET /watch-history/progress/:tvShowId` | Overall + per-season progress + next episode               |
| `GET /watch-history?mediaType=episode`  | Which episodes are watched (entry id + mediaId)            |
| `POST /watch-history`                   | Log a single episode watch (`mediaType:'episode'`)         |
| `DELETE /watch-history/:id`             | Delete a watch entry (toggle episode unwatched)            |
| `POST /watch-history/batch`             | Batch-log a `season` or `show` (aired episodes)            |
| `GET /arr/sonarr/series/:tvdbId/check`  | Resolve Sonarr presence + monitored state (optional layer) |

The show page issues four parallel reads (show, seasons, progress, Sonarr check); the season page derives the season from the seasons list, then reads that season's episodes plus episode watch-history. There is no single "show with seasons + episodes" aggregate — each level is its own request.

## Layout & Behaviour

### Show Detail (`/media/tv/:id`)

- [x] Full-width backdrop (`backdropUrl`) with a top gradient overlay for readability; muted background when no backdrop.
- [x] Poster overlaid on the hero (2:3); muted placeholder block when `posterUrl` is null.
- [x] Title as a large heading; breadcrumb (Media › Show) overlaid top-left.
- [x] Year range via `formatYearRange(firstAirDate, lastAirDate, status)`: `Start–End` for ended shows, `Start–Present` for `Returning Series`/`In Production`, `Start` when end year equals start or no last air date.
- [x] Raw `status` string shown next to the year range; a Sonarr status badge (`ArrStatusBadge`) renders alongside.
- [x] Overall progress bar (`overall.watched`/`overall.total`) rendered when total > 0; green at 100%, accent otherwise.
- [x] "Continue watching" link to the next unwatched episode (`nextEpisode`, formatted `S01E03 — name`); hidden when all watched.
- [x] "Mark All Watched" button → `POST /watch-history/batch` with `{ mediaType:'show', mediaId }`; replaced by an "All Watched" check when `overall.watched >= overall.total`.
- [x] Overview section (hidden if empty), genres as badge pills, and a details grid (status, language as the uppercased `originalLanguage` code, networks joined, TMDB rating, season count) skipping null values.
- [x] Loading skeleton while the show query is in flight; invalid non-numeric id and 404 both render a destructive alert with a "Back to library" link.

### Season List (on the show page)

- [x] One row per season: label (`Specials` for season 0, else `name` or `Season N`), episode count, and a per-season progress mini-bar (from `progress.seasons` matched by `seasonNumber`).
- [x] Sorted ascending by `seasonNumber`, with season 0 (Specials) forced last.
- [x] Whole row (label + count + progress) is a link to `/media/tv/:id/season/:num`; hover/focus styling on the row.
- [x] "No seasons available" message when the show has no seasons.
- [x] When the series exists in Sonarr, each row also shows a season-monitoring switch with optimistic toggle (pending switches disabled).

### Season Detail (`/media/tv/:id/season/:num`)

- [x] `PageHeader` with back link and Media › Show › Season breadcrumb.
- [x] Season header: poster (rendered only if `posterUrl` set), name (`name` or `Season N`/`Specials`), episode count, "First aired {airDate}", overview (hidden if empty), and a per-season progress bar.
- [x] Episode rows: episode number, name (or `Episode N`), air date, runtime via `formatRuntime` (`Xh Ym`/`Ym`), and a watched checkbox; expandable chevron reveals the overview.
- [x] Watch checkbox: filled check when watched, empty when not. Click toggles — watched → `POST /watch-history`, unwatched → `DELETE /watch-history/:id` (entry id resolved from the episode watch-history list).
- [x] Per-episode toggle is optimistic via a `togglingIds` set; the toggled episode is disabled while its mutation is in flight, and a toast surfaces on failure. Mutations invalidate the seasons query so progress refreshes.
- [x] Upcoming episodes (air date in the future) render dimmed with an "Upcoming" label and a disabled watch toggle.
- [x] "Mark Season Watched" → `POST /watch-history/batch` with `{ mediaType:'season', mediaId: seasonId }`; replaced by an "All Watched" badge when the season's progress is fully watched.
- [x] Invalid params, show 404, and unknown season number each render a dedicated error view; loading skeletons while show/seasons/episodes load.
- [x] When the series exists in Sonarr, the header exposes season/episode monitoring toggles and rows show a "downloaded" (file-on-disk) indicator + per-episode monitor switch.

## Business Rules

- Progress is server-computed by `GET /watch-history/progress/:tvShowId`; the UI never recomputes overall/per-season totals client-side.
- `nextEpisode` is the server's chosen next unwatched episode and links into the matching season route.
- Batch operations are single calls (`/watch-history/batch`), not one request per episode; they only log **aired** episodes.
- Specials (season 0) sort last everywhere; ascending season number otherwise.
- Upcoming episodes (future air date) are non-toggleable and visually dimmed.
- Logging a watch can auto-remove the item from the watchlist server-side (the `log` response carries `watchlistRemoved`).

## Edge Cases

| Case                          | Behaviour                                                             |
| ----------------------------- | --------------------------------------------------------------------- |
| Non-numeric / invalid show id | "Invalid show ID" alert                                               |
| Show not found                | "Show not found" alert + back-to-library link                         |
| Season number not in show     | "Season not found" error view linking back to the show                |
| Show with no seasons          | "No seasons available"                                                |
| Season with no episodes       | "No episodes available."                                              |
| All episodes watched          | Progress bar at 100% (green); batch buttons replaced by "All Watched" |
| Episode not yet aired         | Dimmed row, "Upcoming" label, toggle disabled                         |
| Toggle / batch failure        | Optimistic state reverts on settle; error toast                       |

## Out of Scope

- Editing show/season/episode metadata; removing a show from the library.
- Cast/crew, episode ratings, similar-show recommendations.

## Deferred (see `docs/ideas/`)

- Watchlist toggle on the show detail page and per-season poster thumbnails in the season list → `tv-show-detail-watchlist-and-season-posters.md`.
