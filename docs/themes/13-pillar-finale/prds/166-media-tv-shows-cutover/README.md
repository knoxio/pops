# PRD-166: media.tvShows cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `tv_shows`, `seasons`, `episodes` tables + `media.tvShows.*` procedures into `media.db`. Follows the canonical N-track 4-PR pattern from [PRD-165](../165-media-movies-cutover/README.md). This is the second-largest media slice; three related tables move together because they share FK chains (`episodes.season_id → seasons.id → tv_shows.id`).

## Data Model

Tables (all move from shared to `packages/media-db`):

- `tv_shows` — root entity
- `seasons` — child of tv_shows
- `episodes` — child of seasons

FK preservation: in the per-pillar baseline migration, FKs declare `ON DELETE CASCADE` (preserving current shared-schema behaviour). Backfill order: `tv_shows` → `seasons` → `episodes` (parents first).

## API Surface

| Procedure                     | Kind     | Notes                                            |
| ----------------------------- | -------- | ------------------------------------------------ |
| `media.tvShows.list`          | query    | Paginated, search/genre filter                   |
| `media.tvShows.get`           | query    | Includes seasons + episodes via JSON aggregation |
| `media.tvShows.create`        | mutation | Hand-create (rare; TMDB sync is primary path)    |
| `media.tvShows.update`        | mutation |                                                  |
| `media.tvShows.delete`        | mutation | CASCADE removes seasons + episodes               |
| `media.tvShows.seasons.list`  | query    | Per-show season listing                          |
| `media.tvShows.episodes.list` | query    | Per-season episode listing                       |

Files today: `apps/pops-api/src/modules/media/tv-shows/{router.ts, service.ts, seasons-service.ts, episodes-service.ts, tv-shows-base.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Backfill copies `tv_shows`, `seasons`, `episodes` in that order (FK-safe).
- Schema-coverage CI (PRD-2917) validates all three tables + their indices in `media.db`.
- Drift-guard CI (`media-db-quality.yml`) tracks all three tables byte-for-byte during the transition window.

## Edge Cases

| Case                                            | Behaviour                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| Episode created before its season is backfilled | Backfill order prevents this; FK constraint catches if ordering breaks. |
| Sync writes an episode mid-cutover              | Worker uses `getMediaDrizzle()` after PR 3 lands; no race.              |
| `media.tvShows.get` returns a denormalised view | Service computes joins; works against either DB; behaviour preserved.   |

## User Stories

| #   | Story                                                       | Summary                                                          |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — 3 tables + services into `@pops/media-db`; backfill order |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal; drift-guard                     |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip routers to `getMediaDrizzle()`                       |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim files                                |

## Out of Scope

- TVDB sync logic changes; only DB handle changes.
- Season / episode entity contracts beyond what currently exists.
- Removing the legacy mount on pops-api (deferred per M3 batching).
