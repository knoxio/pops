# PRD-170: media.discovery cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move the `dismissed_discover` table + the `media.discovery.*` read paths onto the media pillar's SQLite handle (`getMediaDrizzle()`). Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

The discovery surface is overwhelmingly an orchestration layer over already-migrated tables (`movies`, `tv_shows`, `mediaWatchlist`, `watchHistory`, `shelf_impressions`). The only state it persists itself is the dismiss-pile. Context collections are static TS data (`context-collections.ts`); genre spotlight and the "flags" service are computed on demand from TMDB + the preference profile — no tables.

## Data Model

The only discovery-owned table is `dismissed_discover` (PK `tmdb_id`, `dismissed_at text` defaulted to `datetime('now')`). It moves into `packages/media-db`:

- Schema re-export in `packages/media-db/src/schema.ts`.
- Baseline migration `0026_media_dismissed_discover_baseline.sql` so `openMediaDb()` provisions the table.
- `dismissedDiscoverService` (db-arg pattern): `dismiss`, `undismiss`, `listDismissedTmdbIds`, `getDismissedTmdbIdSet`, `listDismissed`.

`shelf_impressions` already lives in media.db from M3 PR 1.

## API Surface

| Procedure                                   | Kind              | Backing data                            |
| ------------------------------------------- | ----------------- | --------------------------------------- |
| `media.discovery.dismiss`                   | mutation          | `dismissed_discover`                    |
| `media.discovery.undismiss`                 | mutation          | `dismissed_discover`                    |
| `media.discovery.getDismissed`              | query             | `dismissed_discover`                    |
| `media.discovery.profile`                   | query             | `movies`, `mediaScores`, `comparisons`  |
| `media.discovery.quickPick`                 | query             | `movies`, `watchHistory`, `watchlist`   |
| `media.discovery.fromYourServer`            | query             | `movies`, `watchHistory`                |
| `media.discovery.rewatchSuggestions`        | query             | `movies`, `watchHistory`, `mediaScores` |
| `media.discovery.trending` / `trendingPlex` | query             | TMDB / Plex (no DB)                     |
| `media.discovery.recommendations`           | query             | TMDB + preference profile               |
| `media.discovery.contextPicks`              | query             | TMDB (static collections in code)       |
| `media.discovery.genreSpotlight` / `Page`   | query             | TMDB + preference profile               |
| `media.discovery.assembleSession`           | query (composite) | `shelf_impressions` + everything above  |

Files today: `apps/pops-api/src/modules/media/discovery/{service*.ts, context-picks-service.ts, genre-spotlight-service.ts, plex-service.ts, tmdb-service.ts, shelf/}`.

## Business Rules

Follows [PRD-165's N-track sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- **Cross-store joins block a single-shot handle flip.** `service-preference-profile.ts`, `service-rewatch.ts`, and `shelf/local-score-shelves.ts` join `movies` (already in media.db) against `mediaScores` / `comparisons` / `comparisonDimensions` (still in the shared journal). Flipping those readers to `getMediaDrizzle()` would break the joins. They wait for the comparisons / mediaScores cutovers.
- **Handle-safe reads can flip immediately** in PR 2: `service-library.ts` (`getQuickPickMovies`, `getUnwatchedLibraryMovies`) and `router-tmdb.ts::getLibraryTmdbIds` touch only `movies` / `watchHistory` / `mediaWatchlist`, all on media.db.
- `assembleSession` already uses `getMediaDrizzle()` for `shelfImpressionsService`. It composes shelves whose internal queries each run on whichever handle their backing table lives on. Behaviour is preserved as long as each backing table's read handle matches its actual location.
- Backfill: the dismiss-pile is small (one row per dismissal); the existing `backfillMediaFromShared()` pattern from the movies/watchlist cutovers copies rows on first boot.

## Edge Cases

| Case                                                                            | Behaviour                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `assembleSession` runs during partial cutover (some sources migrated, some not) | Behaviour preserved as long as each source's read handle matches its actual backing-table location. |
| Dismissed item references a movie that's been deleted                           | Soft reference; the discovery filter pipeline drops missing TMDB ids when joining against `movies`. |

## User Stories

| #   | Story                                                       | Summary                                                                                                             |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — `dismissed_discover` schema + service + baseline migration into `@pops/media-db`. No consumer flip.          |
| 02  | [us-02-pr2-reads-cutover](us-02-pr2-reads-cutover.md)       | PR 2 — Flip handle-safe readers (`service-library`, `router-tmdb::getLibraryTmdbIds`, dismiss readers) to media.db. |
| 03  | [us-03-pr3-writes-cutover](us-03-pr3-writes-cutover.md)     | PR 3 — Flip the dismiss writer + remaining cross-store readers once `mediaScores` / `comparisons` are on media.db.  |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Drop `dismissed_discover` from the shared journal and delete the shim.                                       |

## Out of Scope

- Recommender / scoring algorithm changes.
- New discovery surfaces beyond what exists.
- AI-generated discovery prompts (separate AI Ops concern).
- `mediaScores` / `comparisons` / `comparisonDimensions` cutovers (own PRDs).
