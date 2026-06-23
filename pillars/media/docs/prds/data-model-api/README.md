# Media Data Model & API

Status: Done — the schema and the REST surface below are shipped. Domain logic
(ELO, watchlist auto-removal, weight-blended rankings) lives in `src/db/services`.

The media pillar owns its own SQLite DB and serves a ts-rest (zod) contract
(`src/contract/rest-*.ts`) projected to `openapi/media.openapi.json`. This PRD
covers the foundational domain: movies, TV hierarchy (show → season → episode),
watchlist, watch history, and the pairwise ELO ranking engine. Higher-level
features (Plex sync, \*arr integration, discovery, rotation, search, settings)
build on these tables and are documented in their own PRDs.

## Data Model

Nine core tables. Auto-increment integer PKs throughout. Timestamps are ISO 8601
TEXT defaulting to `datetime('now')`. Genres/networks are JSON-array TEXT columns
parsed on read.

### `movies`

`id`, `tmdbId` (UNIQUE, natural key), `imdbId`, `title`, `originalTitle`,
`overview`, `tagline`, `releaseDate`, `runtime`, `status`, `originalLanguage`,
`budget`, `revenue`, `posterPath`, `backdropPath`, `logoPath`,
`posterOverridePath`, `discoverRatingKey`, `voteAverage`, `voteCount`, `genres`,
`createdAt`, `updatedAt`, plus rotation fields `rotationStatus`
(`leaving`|`protected`), `rotationExpiresAt`, `rotationMarkedAt`.
Indexes: `tmdbId` UNIQUE, `title`, `releaseDate`, `rotationStatus`.

### `tv_shows`

`id`, `tvdbId` (UNIQUE), `name`, `originalName`, `overview`, `firstAirDate`,
`lastAirDate`, `status`, `originalLanguage`, `numberOfSeasons`,
`numberOfEpisodes`, `episodeRunTime`, `posterPath`, `backdropPath`, `logoPath`,
`posterOverridePath`, `discoverRatingKey`, `voteAverage`, `voteCount`, `genres`,
`networks`, `createdAt`, `updatedAt`.
Indexes: `tvdbId` UNIQUE, `name`, `firstAirDate`.

### `seasons`

`id`, `tvShowId` (FK → `tv_shows.id` ON DELETE CASCADE), `tvdbId` (UNIQUE),
`seasonNumber` (0 = specials), `name`, `overview`, `posterPath`, `airDate`,
`episodeCount`, `createdAt`.
Indexes: `tvdbId` UNIQUE, `(tvShowId, seasonNumber)` UNIQUE, `tvShowId`.

### `episodes`

`id`, `seasonId` (FK → `seasons.id` ON DELETE CASCADE), `tvdbId` (UNIQUE),
`episodeNumber`, `name`, `overview`, `airDate`, `stillPath`, `voteAverage`,
`runtime`, `createdAt`.
Indexes: `tvdbId` UNIQUE, `(seasonId, episodeNumber)` UNIQUE, `seasonId`.

### `watchlist`

`id`, `mediaType` (`movie`|`tv_show`), `mediaId`, `priority` (default 0, lower =
higher), `notes`, `addedAt`, `source` (default `manual`), `plexRatingKey`.
Index: `(mediaType, mediaId)` UNIQUE.

### `watch_history`

`id`, `mediaType` (`movie`|`episode`), `mediaId`, `watchedAt`, `completed`
(default 1), `blacklisted` (default 0).
Indexes: `(mediaType, mediaId)`, `watchedAt`, `(mediaType, mediaId, watchedAt)`
UNIQUE.

### `comparison_dimensions`

`id`, `name` (UNIQUE), `description`, `active` (default 1), `sortOrder`,
`weight` (REAL default 1.0), `createdAt`.

### `comparisons`

`id`, `dimensionId` (FK → `comparison_dimensions.id`), `mediaAType`, `mediaAId`,
`mediaBType`, `mediaBId`, `winnerType`, `winnerId`, `drawTier`, `source`,
`deltaA`, `deltaB`, `comparedAt`.
Indexes: `dimensionId`, `(mediaAType, mediaAId)`, `(mediaBType, mediaBId)`.

### `media_scores`

`id`, `mediaType`, `mediaId`, `dimensionId` (FK → `comparison_dimensions.id`),
`score` (default 1500.0), `comparisonCount` (default 0), `excluded` (default 0),
`updatedAt`.
Indexes: `(mediaType, mediaId, dimensionId)` UNIQUE, `dimensionId`.

Polymorphic references (`mediaType` + `mediaId`) on watchlist, watch history,
comparisons, and scores have NO database-level FK — referential integrity is
validated in the application layer. TV hierarchy (show → season → episode) IS
enforced at the DB level via FK CASCADE.

## REST API Surface

All routes are served under the pillar's contract (no path prefix). Mutations
return `{ data, message }`; lists return `{ data, pagination }`.

### Movies — `/movies`

`GET /movies` (search, genre, limit, offset) · `GET /movies/:id` ·
`POST /movies` · `PATCH /movies/:id` · `DELETE /movies/:id`.

### TV shows — `/tv-shows`

`GET /tv-shows` (search, status, limit, offset) · `GET /tv-shows/:id` ·
`POST /tv-shows` · `PATCH /tv-shows/:id` · `DELETE /tv-shows/:id` ·
`GET /tv-shows/:tvShowId/seasons` · `POST /tv-shows/:tvShowId/seasons` ·
`DELETE /seasons/:id` · `GET /seasons/:seasonId/episodes` ·
`POST /seasons/:seasonId/episodes` · `DELETE /episodes/:id`.

### Watchlist — `/watchlist`

`GET /watchlist` · `GET /watchlist/status` (mediaType, mediaId) ·
`GET /watchlist/:id` · `POST /watchlist` (idempotent on `mediaType`+`mediaId`) ·
`POST /watchlist/reorder` · `PATCH /watchlist/:id` · `DELETE /watchlist/:id`.

### Watch history — `/watch-history`

`GET /watch-history` · `GET /watch-history/recent` (enriched) ·
`GET /watch-history/progress/:tvShowId` · `POST /watch-history/batch-progress` ·
`GET /watch-history/:id` · `POST /watch-history` (log) ·
`POST /watch-history/batch` (all aired episodes of a season/show) ·
`DELETE /watch-history/:id`.

### Comparisons & rankings

`GET /comparison-dimensions` (seeds defaults if empty) ·
`POST /comparison-dimensions` · `PATCH /comparison-dimensions/:id` ·
`POST /comparisons` (record 1v1 + ELO update) ·
`GET /comparisons/for-media` · `GET /comparisons/smart-pair` ·
`POST /comparisons/batch` · `POST /comparisons/skip` ·
`POST /comparisons/blacklist-movie` · `POST /comparisons/recalc-all` ·
`GET /comparisons` · `DELETE /comparisons/:id` ·
`GET /comparison-scores` · `GET /comparison-rankings` ·
`POST /comparison-scores/exclude` · `POST /comparison-scores/include` ·
`POST /comparison-staleness/mark` · `GET /comparison-staleness` ·
`GET /tier-list/:dimensionId` · `POST /tier-list`.

### Image bytes (NOT in the ts-rest contract)

`GET /media/images/:mediaType/:id/:filename` is a raw Express byte route
serving `MEDIA_IMAGES_DIR` directly (cached file → on-demand download fallback).
It is intentionally excluded from the contract, contributes no OpenAPI paths,
and validates the resolved path stays inside `MEDIA_IMAGES_DIR` (no traversal).

## Business Rules

- Split tables for movies vs TV shows; TV hierarchy enforced via FK CASCADE
  deletes (delete show → seasons → episodes).
- Watchlist add is idempotent on `(mediaType, mediaId)` — a conflicting add
  returns the existing entry unchanged (response carries `created: false`).
- Watch-history log is idempotent on `(mediaType, mediaId, watchedAt)`; a
  `blacklisted` entry at the same key short-circuits and is returned unchanged.
- Watch-completion auto-removal (skipped when `source = plex_sync`): logging a
  movie with `completed = 1` removes it from the watchlist; logging an episode
  with `completed = 1` removes the parent show only when ALL of the show's
  episodes are completed. Removal resequences remaining watchlist priorities.
  All of this runs in one transaction with the history insert and staleness
  reset.
- ELO: starting score and K-factor are resolved from the pillar `settings` table
  with defaults 1500.0 and K=32. Expected score is
  `1 / (1 + 10^((opponent − self) / 400))`; new = old + K·(actual − expected).
  Winner/loser update atomically; `comparisonCount` increments for both; the
  recorded `deltaA`/`deltaB` capture the swing.
- Draw tiers map to non-binary outcomes: `high` = 0.7, `low` = 0.3, anything
  else = 0.5, so a draw can still move ratings.
- Rankings: per-dimension when `dimensionId` is given; otherwise an overall
  list weight-blended across active dimensions as `Σ(score·weight)/Σ(weight)`,
  excluding `media_scores` rows flagged `excluded`. Items with zero comparisons
  sort last, then by score DESC, then title ASC.
- `getSmartPair` returns a weighted-probabilistic pair (random fallback) and
  returns `data: null` with `reason: 'insufficient_watched_movies'` when fewer
  than two watched movies exist.
- `skip` puts a pair on cooloff for 10 global comparisons; `blacklist-movie`
  marks its watch events, purges its comparisons, and recalculates ELO.

## Acceptance Criteria

- [x] All nine tables exist with the columns, defaults, and indexes above; FK
      CASCADE verified for show→season→episode deletes.
- [x] `seasonNumber` 0 is accepted (specials); `genres`/`networks` round-trip as
      JSON arrays.
- [x] Movie/TV/season/episode CRUD endpoints validate input via zod, paginate
      with a total count, and return 404 on missing ids.
- [x] Watchlist add is idempotent and surfaces `created`; reorder updates all
      items in a single transaction.
- [x] `POST /watch-history` auto-removes from the watchlist per the rules above
      and is idempotent on the unique key.
- [x] `progress`/`batch-progress` return overall + per-season completion
      percentages; `batch` logs all aired episodes of a season or show.
- [x] `POST /comparisons` validates the winner is A or B, updates both ELO
      scores in one transaction, and increments `comparisonCount`.
- [x] `GET /comparison-rankings` returns per-dimension or weight-blended overall
      rankings; `/comparison-scores` returns a media item's per-dimension scores.
- [x] `GET /comparisons/smart-pair` returns `null` + `insufficient_watched_movies`
      below two watched movies.
- [x] `GET /media/images/...` serves cached bytes, falls back to on-demand
      download, and rejects path traversal outside `MEDIA_IMAGES_DIR`.

## Edge Cases

| Case                                                   | Behaviour                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| Duplicate `tmdbId`/`tvdbId` on create                  | UNIQUE constraint error; reuse the existing record         |
| Delete show with seasons + episodes                    | FK CASCADE removes seasons, which CASCADE removes episodes |
| Watch log at an already-recorded `(type,id,watchedAt)` | UNIQUE prevents a duplicate; existing row returned         |
| Watchlist add for an item already listed               | Existing entry returned unchanged (`created: false`)       |
| `smart-pair` with fewer than 2 watched movies          | `data: null`, `reason: 'insufficient_watched_movies'`      |
| Rankings with no comparisons                           | Items at default score, zero-comparison items sorted last  |
| Episode completed but show not on watchlist            | Log succeeds; no auto-removal                              |
| Comparison winner not matching A or B                  | Validation error; nothing recorded                         |
| Comparison against an inactive dimension               | Rejected (`InactiveDimensionError`)                        |
