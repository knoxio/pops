# PRD-168: media.watchHistory cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move the `watch_history` table + `media.watchHistory.*` procedures into `media.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Watch history is the time-series log of "I watched X on Y date." Feeds into the recommender + ad-hoc analytics. Largest by row count of the media tables; appendd-mostly; minimal mutation surface.

## Data Model

Tables (move from shared to `packages/media-db`):

- `watch_history` — { id, item_type ('movie' | 'tv' | 'episode'), item_id, watched_at, duration_minutes, source, completion_percent, notes }

Indexed on `watched_at` (queries are time-range heavy) and `(item_type, item_id)` (per-item history lookups).

## API Surface

| Procedure                        | Kind     |
| -------------------------------- | -------- |
| `media.watchHistory.list`        | query    |
| `media.watchHistory.byItem`      | query    |
| `media.watchHistory.byDateRange` | query    |
| `media.watchHistory.add`         | mutation |
| `media.watchHistory.update`      | mutation |
| `media.watchHistory.delete`      | mutation |

Files today: `apps/pops-api/src/modules/media/watch-history/{router.ts, service.ts, handlers/*}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Backfill is potentially large (years of history accumulated in `pops.db`). Batched INSERT-WHERE-NOT-EXISTS; runs at first boot post-cutover. Watch for slow first boot.
- `media.watchHistory.byDateRange` is the heaviest query; preserve index on `watched_at` in per-pillar baseline.
- **Mixed-tx writers (`logWatch`, `blacklistMovie`) follow the design in [notes/media-watch-history-mixed-tx-design.md](../../notes/media-watch-history-mixed-tx-design.md).** Cross-pillar `logWatch ↔ debrief` coupling is broken via Option D (split tx + SDK call + idempotent reconciliation); same-pillar writers (`blacklistMovie`) cut over with the handle.

## Edge Cases

| Case                                                        | Behaviour                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Backfill takes > 5 seconds for large history                | Acceptable on first boot only; subsequent boots are no-op via WHERE NOT EXISTS.                 |
| User watches something during the cutover deploy window     | Writes land via the active handle; potential dual-write window narrows as PRs land in sequence. |
| Plex sync detects a watched item already in `watch_history` | Idempotent; INSERT OR IGNORE on conflict.                                                       |

## User Stories

| #   | Story                                                       | Summary                                                                                      |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schema + service + batched backfill                                                   |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                                                              |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip leaf reads to `getMediaDrizzle()`; writes deferred (every writer is mixed-table) |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                                                                  |

Writer-cutover sequencing (PR 3.5 / pre-PR 4) is specified in [notes/media-watch-history-mixed-tx-design.md](../../notes/media-watch-history-mixed-tx-design.md).

## Out of Scope

- Recommender algorithm changes; only DB handle changes.
- Historical analytics dashboards; existing endpoints preserved.
- Compaction / archival of old history rows.
