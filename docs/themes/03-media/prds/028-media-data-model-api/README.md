# PRD-028: Media Data Model & API

> Epic: [00 — Data Model & API](../../epics/00-data-model-api.md)
> Status: Done

## Overview

Define the media domain schema and build the tRPC routers that all other media features depend on. Nine tables cover movies, TV shows (with season/episode hierarchy), watchlist, watch history, and pairwise comparison scoring. Split tables per [ADR-008](../../../../architecture/adr-008-media-split-tables.md).

## Data Model

### movies

| Column             | Type    | Constraints       | Description                       |
| ------------------ | ------- | ----------------- | --------------------------------- |
| id                 | INTEGER | PK, autoincrement |                                   |
| tmdbId             | INTEGER | UNIQUE NOT NULL   | TMDB external identifier          |
| imdbId             | TEXT    | nullable          | IMDb identifier                   |
| title              | TEXT    | NOT NULL          | Display title                     |
| originalTitle      | TEXT    | nullable          | Title in original language        |
| overview           | TEXT    | nullable          | Synopsis                          |
| tagline            | TEXT    | nullable          | Marketing tagline                 |
| releaseDate        | TEXT    | nullable          | ISO 8601 date (YYYY-MM-DD)        |
| runtime            | INTEGER | nullable          | Duration in minutes               |
| status             | TEXT    | nullable          | "Released", "In Production", etc. |
| originalLanguage   | TEXT    | nullable          | ISO 639-1 code                    |
| budget             | INTEGER | nullable          | Production budget in USD          |
| revenue            | INTEGER | nullable          | Box office revenue in USD         |
| posterPath         | TEXT    | nullable          | Local cached poster path          |
| backdropPath       | TEXT    | nullable          | Local cached backdrop path        |
| logoPath           | TEXT    | nullable          | Local cached logo path            |
| posterOverridePath | TEXT    | nullable          | User-uploaded poster override     |
| voteAverage        | REAL    | nullable          | TMDB community rating             |
| voteCount          | INTEGER | nullable          | TMDB vote count                   |
| genres             | TEXT    | DEFAULT '[]'      | JSON array of genre strings       |
| createdAt          | TEXT    | NOT NULL          | ISO 8601 timestamp                |
| updatedAt          | TEXT    | NOT NULL          | ISO 8601 timestamp                |

**Indexes:** tmdbId (UNIQUE), title, releaseDate

### tv_shows

| Column             | Type    | Constraints       | Description                         |
| ------------------ | ------- | ----------------- | ----------------------------------- |
| id                 | INTEGER | PK, autoincrement |                                     |
| tvdbId             | INTEGER | UNIQUE NOT NULL   | TheTVDB external identifier         |
| name               | TEXT    | NOT NULL          | Display name                        |
| originalName       | TEXT    | nullable          | Name in original language           |
| overview           | TEXT    | nullable          | Synopsis                            |
| firstAirDate       | TEXT    | nullable          | ISO 8601 date                       |
| lastAirDate        | TEXT    | nullable          | ISO 8601 date                       |
| status             | TEXT    | nullable          | "Continuing", "Ended", etc.         |
| originalLanguage   | TEXT    | nullable          | ISO 639-1 code                      |
| numberOfSeasons    | INTEGER | nullable          | Total season count                  |
| numberOfEpisodes   | INTEGER | nullable          | Total episode count                 |
| episodeRunTime     | INTEGER | nullable          | Typical episode duration in minutes |
| posterPath         | TEXT    | nullable          | Local cached poster path            |
| backdropPath       | TEXT    | nullable          | Local cached backdrop path          |
| logoPath           | TEXT    | nullable          | Local cached logo path              |
| posterOverridePath | TEXT    | nullable          | User-uploaded poster override       |
| voteAverage        | REAL    | nullable          | TheTVDB community rating            |
| voteCount          | INTEGER | nullable          | TheTVDB vote count                  |
| genres             | TEXT    | DEFAULT '[]'      | JSON array of genre strings         |
| networks           | TEXT    | DEFAULT '[]'      | JSON array of network strings       |
| createdAt          | TEXT    | NOT NULL          | ISO 8601 timestamp                  |
| updatedAt          | TEXT    | NOT NULL          | ISO 8601 timestamp                  |

**Indexes:** tvdbId (UNIQUE), name, firstAirDate

### seasons

| Column       | Type    | Constraints                         | Description                  |
| ------------ | ------- | ----------------------------------- | ---------------------------- |
| id           | INTEGER | PK, autoincrement                   |                              |
| tvShowId     | INTEGER | FK → tv_shows(id) ON DELETE CASCADE | Parent show                  |
| tvdbId       | INTEGER | UNIQUE NOT NULL                     | TheTVDB external identifier  |
| seasonNumber | INTEGER | NOT NULL                            | 0 = specials                 |
| name         | TEXT    | nullable                            | Season name                  |
| overview     | TEXT    | nullable                            | Season synopsis              |
| posterPath   | TEXT    | nullable                            | Local cached poster path     |
| airDate      | TEXT    | nullable                            | ISO 8601 date                |
| episodeCount | INTEGER | nullable                            | Episode count in this season |
| createdAt    | TEXT    | NOT NULL                            | ISO 8601 timestamp           |

**Indexes:** tvdbId (UNIQUE), (tvShowId + seasonNumber) UNIQUE, tvShowId

### episodes

| Column        | Type    | Constraints                        | Description                  |
| ------------- | ------- | ---------------------------------- | ---------------------------- |
| id            | INTEGER | PK, autoincrement                  |                              |
| seasonId      | INTEGER | FK → seasons(id) ON DELETE CASCADE | Parent season                |
| tvdbId        | INTEGER | UNIQUE NOT NULL                    | TheTVDB external identifier  |
| episodeNumber | INTEGER | NOT NULL                           | Episode number within season |
| name          | TEXT    | nullable                           | Episode title                |
| overview      | TEXT    | nullable                           | Episode synopsis             |
| airDate       | TEXT    | nullable                           | ISO 8601 date                |
| stillPath     | TEXT    | nullable                           | Episode still image path     |
| voteAverage   | REAL    | nullable                           | Community rating             |
| runtime       | INTEGER | nullable                           | Duration in minutes          |
| createdAt     | TEXT    | NOT NULL                           | ISO 8601 timestamp           |

**Indexes:** tvdbId (UNIQUE), (seasonId + episodeNumber) UNIQUE, seasonId

### media_watchlist

| Column    | Type    | Constraints       | Description                                                 |
| --------- | ------- | ----------------- | ----------------------------------------------------------- |
| id        | INTEGER | PK, autoincrement |                                                             |
| mediaType | TEXT    | NOT NULL          | "movie" or "tv_show"                                        |
| mediaId   | INTEGER | NOT NULL          | FK to movies(id) or tv_shows(id) — validated in application |
| priority  | INTEGER | DEFAULT 0         | Lower value = higher priority                               |
| notes     | TEXT    | nullable          | User notes                                                  |
| addedAt   | TEXT    | NOT NULL          | ISO 8601 timestamp                                          |

**Indexes:** (mediaType + mediaId) UNIQUE

### watch_history

| Column    | Type    | Constraints       | Description                                                 |
| --------- | ------- | ----------------- | ----------------------------------------------------------- |
| id        | INTEGER | PK, autoincrement |                                                             |
| mediaType | TEXT    | NOT NULL          | "movie" or "episode"                                        |
| mediaId   | INTEGER | NOT NULL          | FK to movies(id) or episodes(id) — validated in application |
| watchedAt | TEXT    | NOT NULL          | ISO 8601 timestamp                                          |
| completed | INTEGER | DEFAULT 0         | 0 = in progress, 1 = completed                              |

**Indexes:** (mediaType + mediaId), watchedAt, (mediaType + mediaId + watchedAt) UNIQUE

### comparison_dimensions

| Column      | Type    | Constraints       | Description                                           |
| ----------- | ------- | ----------------- | ----------------------------------------------------- |
| id          | INTEGER | PK, autoincrement |                                                       |
| name        | TEXT    | UNIQUE NOT NULL   | Dimension label (e.g., "Enjoyment", "Cinematography") |
| description | TEXT    | nullable          | What this dimension measures                          |
| active      | INTEGER | DEFAULT 1         | 0 = excluded from overall ranking                     |
| sortOrder   | INTEGER | NOT NULL          | Display order                                         |
| createdAt   | TEXT    | NOT NULL          | ISO 8601 timestamp                                    |

### comparisons

| Column      | Type    | Constraints                    | Description                      |
| ----------- | ------- | ------------------------------ | -------------------------------- |
| id          | INTEGER | PK, autoincrement              |                                  |
| dimensionId | INTEGER | FK → comparison_dimensions(id) | Dimension this comparison is for |
| mediaAType  | TEXT    | NOT NULL                       | "movie"                          |
| mediaAId    | INTEGER | NOT NULL                       | First media item                 |
| mediaBType  | TEXT    | NOT NULL                       | "movie"                          |
| mediaBId    | INTEGER | NOT NULL                       | Second media item                |
| winnerType  | TEXT    | NOT NULL                       | "movie" (must match A or B)      |
| winnerId    | INTEGER | NOT NULL                       | Winner's media ID                |
| comparedAt  | TEXT    | NOT NULL                       | ISO 8601 timestamp               |

**Indexes:** dimensionId, (mediaAType + mediaAId), (mediaBType + mediaBId)

### media_scores

| Column          | Type    | Constraints                    | Description                                   |
| --------------- | ------- | ------------------------------ | --------------------------------------------- |
| id              | INTEGER | PK, autoincrement              |                                               |
| mediaType       | TEXT    | NOT NULL                       | "movie"                                       |
| mediaId         | INTEGER | NOT NULL                       | FK to movies(id) — validated in application   |
| dimensionId     | INTEGER | FK → comparison_dimensions(id) | Dimension this score is for                   |
| score           | REAL    | DEFAULT 1500.0                 | Elo rating                                    |
| comparisonCount | INTEGER | DEFAULT 0                      | Number of comparisons for this item+dimension |
| updatedAt       | TEXT    | NOT NULL                       | ISO 8601 timestamp                            |

**Indexes:** (mediaType + mediaId + dimensionId) UNIQUE, dimensionId

## API Surface

### media.movies

| Procedure | Input                                   | Output                          | Notes                                                      |
| --------- | --------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `list`    | search?, genre?, limit (50), offset (0) | `{ data: Movie[], pagination }` | Ordered by releaseDate DESC                                |
| `get`     | id                                      | `{ data: Movie }`               | 404 if not found                                           |
| `create`  | tmdbId, title, + optional fields        | `{ data: Movie }`               | Sets createdAt/updatedAt                                   |
| `update`  | id, data (partial)                      | `{ data: Movie }`               | Updates updatedAt                                          |
| `delete`  | id                                      | `{ message }`                   | Cascades to watchlist/history/scores via application logic |

### media.tvShows

| Procedure       | Input                                       | Output                           | Notes                                 |
| --------------- | ------------------------------------------- | -------------------------------- | ------------------------------------- |
| `list`          | search?, status?, limit (50), offset (0)    | `{ data: TvShow[], pagination }` | Ordered by name ASC                   |
| `get`           | id                                          | `{ data: TvShow }`               | 404 if not found                      |
| `create`        | tvdbId, name, + optional fields             | `{ data: TvShow }`               | Sets createdAt/updatedAt              |
| `update`        | id, data (partial)                          | `{ data: TvShow }`               | Updates updatedAt                     |
| `delete`        | id                                          | `{ message }`                    | FK CASCADE deletes seasons + episodes |
| `listSeasons`   | tvShowId                                    | `{ data: Season[] }`             | Ordered by seasonNumber ASC           |
| `createSeason`  | tvShowId, tvdbId, seasonNumber, + optional  | `{ data: Season }`               |                                       |
| `deleteSeason`  | id                                          | `{ message }`                    | FK CASCADE deletes episodes           |
| `listEpisodes`  | seasonId                                    | `{ data: Episode[] }`            | Ordered by episodeNumber ASC          |
| `createEpisode` | seasonId, tvdbId, episodeNumber, + optional | `{ data: Episode }`              |                                       |
| `deleteEpisode` | id                                          | `{ message }`                    |                                       |

### media.watchlist

| Procedure | Input                                 | Output                       | Notes                                                                               |
| --------- | ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `list`    | (none)                                | `{ data: WatchlistEntry[] }` | Ordered by priority ASC, addedAt DESC. Enriched with media metadata (title, poster) |
| `get`     | id                                    | `{ data: WatchlistEntry }`   |                                                                                     |
| `add`     | mediaType, mediaId, priority?, notes? | `{ data: WatchlistEntry }`   | CONFLICT returns existing entry unchanged                                           |
| `update`  | id, priority?, notes?                 | `{ data: WatchlistEntry }`   |                                                                                     |
| `reorder` | items: { id, priority }[]             | `{ message }`                | Batch priority update in single transaction                                         |
| `remove`  | id                                    | `{ message }`                |                                                                                     |

### media.watchHistory

| Procedure       | Input                                                  | Output                                           | Notes                                                                     |
| --------------- | ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `list`          | mediaType?, limit (50), offset (0)                     | `{ data: WatchHistoryEntry[], pagination }`      |                                                                           |
| `listRecent`    | limit (20)                                             | `{ data: WatchHistoryEntry[] }`                  | Enriched with media metadata. For episodes: includes show name and poster |
| `get`           | id                                                     | `{ data: WatchHistoryEntry }`                    |                                                                           |
| `log`           | mediaType, mediaId, watchedAt?, completed?             | `{ data: WatchHistoryEntry }`                    | Auto-removes from watchlist (see business rules)                          |
| `progress`      | tvShowId                                               | `{ overall: number, seasons: SeasonProgress[] }` | Per-show: overall % + per-season %                                        |
| `batchProgress` | tvShowIds: number[]                                    | `{ data: ShowProgress[] }`                       | Batch version of progress                                                 |
| `batchLog`      | mediaType ("season" or "tv_show"), mediaId, watchedAt? | `{ data: WatchHistoryEntry[] }`                  | Marks all episodes in season/show as watched                              |
| `delete`        | id                                                     | `{ message }`                                    |                                                                           |

### media.comparisons

| Procedure         | Input                                                                         | Output                            | Notes                                                                            |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `listDimensions`  | (none)                                                                        | `{ data: ComparisonDimension[] }` | Ordered by sortOrder                                                             |
| `createDimension` | name, description?, sortOrder                                                 | `{ data: ComparisonDimension }`   |                                                                                  |
| `updateDimension` | id, name?, description?, active?, sortOrder?                                  | `{ data: ComparisonDimension }`   |                                                                                  |
| `record`          | dimensionId, mediaAType, mediaAId, mediaBType, mediaBId, winnerType, winnerId | `{ data: Comparison }`            | Validates winner is A or B. Updates Elo scores in same transaction (K=32)        |
| `listForMedia`    | mediaType, mediaId                                                            | `{ data: Comparison[] }`          | All comparisons involving this item                                              |
| `getRandomPair`   | dimensionId                                                                   | `{ a: Movie, b: Movie } \| null`  | Avoids recently compared pairs. Returns null if fewer than 2 watched movies      |
| `scores`          | mediaType, mediaId                                                            | `{ data: MediaScore[] }`          | All dimension scores for one item                                                |
| `rankings`        | dimensionId?                                                                  | `{ data: RankedMedia[] }`         | Per-dimension if specified, otherwise overall = average across active dimensions |

## Business Rules

- Split tables for movies vs TV per [ADR-008](../../../../architecture/adr-008-media-split-tables.md) — TV hierarchy enforced via FKs with CASCADE deletes
- Polymorphic references (mediaType + mediaId) for watchlist, watch history, comparisons, and scores — no FK at database level, validated in application layer
- Auto-increment integer PKs for all media tables
- Genres stored as JSON array of strings, parsed on read
- Watch history auto-removal: when a movie is logged with `completed=1`, auto-remove it from the watchlist. When an episode is logged with `completed=1`, check if ALL episodes in the show are watched — auto-remove the show from watchlist only if so
- Elo scoring uses K-factor of 32, starting score 1500.0. Overall ranking averages scores across all active dimensions
- `seasonNumber` 0 represents specials
- `episodeNumber` is unique per season; `seasonNumber` is unique per show

## Edge Cases

| Case                                                 | Behaviour                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Duplicate tmdbId on movie create                     | Unique constraint error — use existing record                      |
| Duplicate tvdbId on show/season/episode create       | Unique constraint error — use existing record                      |
| Delete show with seasons and episodes                | FK CASCADE deletes all seasons, which CASCADE deletes all episodes |
| Watch history log for already-watched item+timestamp | Unique constraint (mediaType+mediaId+watchedAt) prevents duplicate |
| Watchlist add for item already on list               | Returns existing entry unchanged (CONFLICT clause)                 |
| getRandomPair with fewer than 2 watched movies       | Returns null                                                       |
| Rankings with no comparisons                         | All items at 1500.0, sorted alphabetically                         |
| Episode logged but show not on watchlist             | No auto-removal needed — log succeeds normally                     |
| Comparison winner not matching A or B                | Validation error, comparison not recorded                          |

## User Stories

| #   | Story                                                             | Summary                                                                                      | Status | Parallelisable          |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| 01  | [us-01-movie-tv-schema](us-01-movie-tv-schema.md)                 | Tables for movies, tv_shows, seasons, episodes with indexes and FK cascades                  | Done   | Yes                     |
| 02  | [us-02-tracking-schema](us-02-tracking-schema.md)                 | Tables for media_watchlist, watch_history, comparison_dimensions, comparisons, media_scores  | Done   | Yes                     |
| 03  | [us-03-movie-tv-api](us-03-movie-tv-api.md)                       | CRUD procedures for movies and tvShows (including seasons/episodes)                          | Done   | Blocked by us-01        |
| 04  | [us-04-tracking-comparison-api](us-04-tracking-comparison-api.md) | Procedures for watchlist, watchHistory, and comparisons (Elo scoring, random pair, rankings) | Done   | Blocked by us-01, us-02 |

US-01 and US-02 can run in parallel (independent tables). US-03 needs US-01. US-04 needs both US-01 and US-02.

## Out of Scope

- External API integrations — TMDB and TheTVDB clients (PRD-029, PRD-030)
- UI pages and components (Epic 02)
- Plex sync (Epic 06)
- Recommendation engine (Epic 05)

## Drift Check

last checked: 2026-04-17
