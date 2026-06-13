# PRD-169: media.library cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

`media/library/` is an orchestration/aggregation layer — it has no tables of its own. It joins `movies` and `tv_shows` (the "everything in my library" view), and joins `movies` with `watch_history` (the unwatched quick-picks shelf).

The cutover required is a **read-handle flip** on the aggregation queries, from `getDrizzle()` (shared `pops.db`) to `getMediaDrizzle()` (media pillar `media.db`), so the union list and quick-picks queries hit the pillar SQLite file directly once all participating tables have writer-cutover landed.

Mirrors the N-track pattern from [PRD-165 (movies)](../165-media-movies-cutover/README.md) and [PRD-166 (tv-shows)](../166-media-tv-shows-cutover/README.md), but at the aggregation layer instead of the table-owning layer.

## API Surface

| Procedure                     | File                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `media.library.list`          | `media/library/list-service.ts` (`listLibrary`)       |
| `media.library.listGenres`    | `media/library/list-service.ts` (`listLibraryGenres`) |
| `media.library.getQuickPicks` | `media/library/service.ts` (`getQuickPicks`)          |
| `media.library.addMovie`      | `media/library/service.ts` (`addMovie`)               |
| `media.library.addTvShow`     | `media/library/tv-show-service.ts` (`addTvShow`)      |

## Cross-Store Dependency

The read-handle flip is gated on the following writer cutovers landing first, since each participating table is touched on the shared `pops.db` until its writer cutover:

| Table           | Writer cutover                                     | Status      |
| --------------- | -------------------------------------------------- | ----------- |
| `movies`        | PRD-165 PR 3                                       | Done        |
| `tv_shows`      | PRD-166 PR 3 (blocked on seasons/episodes cutover) | Not started |
| `watch_history` | PRD-168 PR 3                                       | In progress |

Flipping a read to `getMediaDrizzle()` before its corresponding writer is on `media.db` introduces a user-visible staleness window: writes go to `pops.db`, reads come from `media.db`, and `media.db` only receives the row at the next boot-time `backfillMediaFromShared()`. The library list, genres list, and quick-picks would all miss freshly-added TV shows and freshly-recorded watch events until restart.

## Business Rules

Once all three writer cutovers land, the aggregation reads can flip together in one PR. Until then, this PRD investigates the surface and documents the constraint; the cutover itself is the writer's downstream work.

## Edge Cases

| Case                                                            | Behaviour                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Library lists items but the joined movie/tv_show is missing     | Returns the library row with null'd join — existing behaviour preserved.    |
| Quick-picks runs while a write is in flight on shared `pops.db` | Reads stay on shared until cutover, so reads see in-flight writes directly. |

## User Stories

| #   | Story                                                       | Summary                                                                            |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Investigate surface (no `library_*` tables exist; aggregation-only layer)   |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — N/A (no tables owned by this slice)                                         |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip aggregation reads to `getMediaDrizzle()` once writer dependencies land |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — N/A (no shim to delete)                                                     |

## Out of Scope

- `*arr` download orchestration; not part of the library aggregation surface.
- The writer cutovers themselves (`tv_shows`, `watch_history`) — tracked in their own PRDs.
