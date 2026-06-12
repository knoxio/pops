# PRD-167: media.watchlist cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move the `media_watchlist` table + `media.watchlist.*` procedures into `media.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

The watchlist is the canonical "queue to watch" surface. Plex push integration writes to it; UI reads from it; the recommender uses it as feedback signal. Single table; clean cutover.

## Data Model

Tables (move from shared to `packages/media-db`):

- `media_watchlist` — { id, item_type ('movie' | 'tv'), item_id, added_at, source, status }

FK references to `movies(id)` and `tv_shows(id)` are by-id-only (not enforced at SQL level today; soft references). Behaviour preserved.

## API Surface

| Procedure                     | Kind     |
| ----------------------------- | -------- |
| `media.watchlist.list`        | query    |
| `media.watchlist.get`         | query    |
| `media.watchlist.add`         | mutation |
| `media.watchlist.remove`      | mutation |
| `media.watchlist.markWatched` | mutation |

Files today: `apps/pops-api/src/modules/media/watchlist/{router.ts, service.ts, plex-push.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- `plex-push.ts` writes to Plex API based on watchlist additions — that integration is preserved; only the read source (the table query) changes.
- Backfill is simple — one table, no FK ordering.

## Edge Cases

| Case                                                | Behaviour                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| Plex-push fails mid-cutover (transient Plex outage) | Plex client is independent of DB handle; retries work the same.      |
| Watchlist references a movie that was hard-deleted  | Already soft-references; behaviour preserved (returns null on join). |

## User Stories

| #   | Story                                                       | Summary                                       |
| --- | ----------------------------------------------------------- | --------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schema + service into `@pops/media-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal               |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getMediaDrizzle()`     |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                   |

## Out of Scope

- Plex API integration changes.
- Cross-pillar watchlist (e.g. shared list with another user). Single-user assumption.
