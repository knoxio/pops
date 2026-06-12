# PRD-169: media.library cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `library.*` procedures and related tables (`library_items`, `library_filters`) into `media.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

The library surface is the "what I own / what's on disk" view aggregating movies + tv_shows with download/sync state. Read-mostly; writes happen via \*arr ingest + manual edits.

## Data Model

Tables (move from shared to `packages/media-db`):

- `library_items` — { id, item_type, item_id, status ('downloaded' | 'monitored' | 'missing'), file_path, file_size, quality_profile, added_at }
- `library_filters` — { id, name, criteria_json, is_favourite }

`library_items.item_id` soft-references `movies.id` or `tv_shows.id` (depending on item_type).

## API Surface

| Procedure                      | Kind     |
| ------------------------------ | -------- |
| `media.library.list`           | query    |
| `media.library.byFilter`       | query    |
| `media.library.update`         | mutation |
| `media.library.filters.list`   | query    |
| `media.library.filters.create` | mutation |
| `media.library.filters.update` | mutation |
| `media.library.filters.delete` | mutation |

Files today: `apps/pops-api/src/modules/media/library/{router.ts, service.ts, list-service.ts, tv-show-service.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Library list joins to `movies` and `tv_shows` — once both PRDs (165, 166) land, all three tables co-locate in `media.db` and joins stay in-process.
- Filters are user-defined saved searches; pure data; trivial backfill.

## Edge Cases

| Case                                                         | Behaviour                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Library lists items but the joined movie/tv_show is missing  | Returns the library row with null'd join — existing behaviour preserved.                 |
| \*arr ingest writes a library_item before backfill completes | Backfill is idempotent; duplicate `(item_type, item_id, file_path)` ignored on conflict. |

## User Stories

| #   | Story                                                       | Summary                                         |
| --- | ----------------------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + services into `@pops/media-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                 |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip routers to `getMediaDrizzle()`      |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                     |

## Out of Scope

- \*arr download orchestration; only the persistence target changes.
- Filter-query optimisation; existing implementation preserved.
