# PRD-170: media.discovery cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move discovery-related tables + `media.discovery.*` procedures into `media.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Discovery covers context collections, genre spotlights, the dismiss-pile, recommendation flags, and the shelf-impressions surface (already migrated as M3 PR 1). This PRD finishes the discovery slice's data move.

## Data Model

Tables (move from shared to `packages/media-db`):

- `context_collections` — saved discovery collections; { id, label, criteria_json, created_at }
- `dismissed_items` — { id, item_type, item_id, dismissed_at, reason }
- `discovery_flags` — { id, item_type, item_id, flag, value, updated_at }
- `genre_spotlights` — generated/curated featured items per genre

(`shelf_impressions` already lives in media.db from M3 PR 1.)

## API Surface

| Procedure                                   | Kind              |
| ------------------------------------------- | ----------------- |
| `media.discovery.contextCollections.list`   | query             |
| `media.discovery.contextCollections.create` | mutation          |
| `media.discovery.contextCollections.delete` | mutation          |
| `media.discovery.dismissed.list`            | query             |
| `media.discovery.dismissed.add`             | mutation          |
| `media.discovery.dismissed.restore`         | mutation          |
| `media.discovery.flags.list`                | query             |
| `media.discovery.flags.set`                 | mutation          |
| `media.discovery.genreSpotlight.get`        | query             |
| `media.discovery.assembleSession`           | query (composite) |

Files today: `apps/pops-api/src/modules/media/discovery/{context-collections.ts, dismissed.ts, flags.ts, genre-spotlight-service.ts, shelf/}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- `assembleSession` composes from many tables (movies, tv_shows, watchlist, watch_history, dismissed, flags, genre_spotlights). After PRDs 165-169 land, every read source lives in `media.db`; assembleSession's in-process joins work.
- Four small tables; backfill is fast.

## Edge Cases

| Case                                                                            | Behaviour                                                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `assembleSession` runs during partial cutover (some sources migrated, some not) | Behaviour preserved as long as each source's read handle is correct. PRD-3 (cutover) lands all assembleSession reads at once. |
| Dismissed item references a movie that's been deleted                           | Soft reference; assembleSession filters on existence.                                                                         |

## User Stories

| #   | Story                                                       | Summary                                                      |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — 4 schemas + services into `@pops/media-db`            |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                              |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip routers + assembleSession to `getMediaDrizzle()` |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                                  |

## Out of Scope

- Recommender / scoring algorithm changes.
- New discovery surfaces beyond what exists.
- AI-generated discovery prompts (separate AI Ops concern).
