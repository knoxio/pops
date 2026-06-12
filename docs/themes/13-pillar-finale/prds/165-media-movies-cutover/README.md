# PRD-165: media.movies cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move the `movies` table + the `media.movies.*` tRPC procedures out of the shared `pops.db` and into the `media.db` per-pillar database via the canonical N-track 4-PR sequence. After this PRD ships, the legacy mount on pops-api still exists as a fall-through (per the M3 batching constraint) but every write lands in `media.db.movies`. PRD-165 establishes the canonical pattern referenced by every other Epic 03 PRD.

This is the largest single slice in the Theme 13 backlog after the N-track work — `movies` is the source-of-truth table for the media pillar's primary entity, with 5 CRUD procedures, search-adapter integration, URI handlers, and AI-categorisation hooks.

## Data Model

### Table moves to `packages/media-db`

```ts
// packages/media-db/src/schema/movies.ts (copied from packages/db-types/src/schema/movies.ts)
export const movies = sqliteTable('movies', { ... });
```

The schema definition stays the same — just relocates. All indexes, FK constraints, and CHECK clauses copy over.

### Migration files

- `packages/media-db/migrations/00XX_media_movies_baseline.sql` — `CREATE TABLE movies (...)` lifted from current shared journal.
- `apps/pops-api/src/db/drizzle-migrations/00YY_media_movies_journal_split.sql` — drops the `movies` entry from the shared journal manifest.
- Drift-guard CI job ensures byte-identical SQL between shared and per-pillar copies during the transition window (per Theme 12's Track L pattern).

### Backfill

`apps/pops-api/src/db/backfill-media-from-shared.ts` already exists from M3 PR 1. Extend `TABLE_COPIES` to include `movies`:

```ts
{ table: 'movies', idColumn: 'id', columns: [/* ... all columns ... */] }
```

Same idempotent INSERT-WHERE-NOT-EXISTS pattern.

## API Surface

### tRPC procedures (move from pops-api to pops-media-api)

| Procedure             | Kind     | Today                       | After                            |
| --------------------- | -------- | --------------------------- | -------------------------------- |
| `media.movies.list`   | query    | pops-api → shared.db.movies | pops-media-api → media.db.movies |
| `media.movies.get`    | query    | pops-api → shared.db.movies | pops-media-api → media.db.movies |
| `media.movies.create` | mutation | pops-api → shared.db.movies | pops-media-api → media.db.movies |
| `media.movies.update` | mutation | pops-api → shared.db.movies | pops-media-api → media.db.movies |
| `media.movies.delete` | mutation | pops-api → shared.db.movies | pops-media-api → media.db.movies |

### OpenAPI surface

All five procedures already advertise OpenAPI metadata (`/media/movies`, `/media/movies/{id}`). Preserve on the new container; PRD-153's openapi-generator picks them up automatically.

### Search adapter

`apps/pops-api/src/modules/media/search/movies-adapter.ts` is the search registration. Moves to `apps/pops-media-api/src/modules/movies/search-adapter.ts` and registers via the media contract's `search.adapters` array (per PRD-155).

### URI handler

`apps/pops-api/src/modules/media/uri-handler.ts` resolves `pops:media/movie/<id>`. The movies portion moves to `apps/pops-media-api/src/modules/movies/uri-handler.ts`.

## Business Rules — The N-track 4-PR sequence

This is the **canonical template** for every slice in Epic 03. Subsequent PRDs (166-186) reference this section.

### PR 1 — `@pops/media-db` scaffold + shim

- Add `movies` schema to `packages/media-db/src/schema/movies.ts`.
- Add `movies` baseline migration to `packages/media-db/migrations/00XX_*.sql`.
- Export typed service `moviesService.{list, get, create, update, delete}` from `@pops/media-db`.
- In `apps/pops-api/src/modules/media/movies/service.ts`, leave behaviour unchanged but import the schema from `@pops/media-db` instead of `@pops/db-types` (forward dep on the new package).
- Update `apps/pops-api/src/db/backfill-media-from-shared.ts` to include `movies` in `TABLE_COPIES`.
- New finance-pillar baseline-extension-style migration if `movies` columns drifted from the shared definition.
- CI: Q1 schema-coverage check (PRD-2917) must pass.

### PR 2 — Journal split

- Drop the `movies` `CREATE TABLE` entries from `apps/pops-api/src/db/drizzle-migrations/00YY_*.sql` (the shared journal).
- Keep byte-identical copies in `packages/media-db/migrations/` during the transition (1-release-cycle window).
- Drift-guard CI job (`media-db-quality.yml`) ensures bytewise lockstep.

### PR 3 — Cutover

- Flip `apps/pops-api/src/modules/media/movies/router.ts` to use `getMediaDrizzle()` (the per-pillar handle) instead of `getDrizzle()`.
- All inner-procedure handlers route through `moviesService` against the finance handle.
- Search adapter + URI handler relocate to per-pillar files (still mounted from pops-api as fall-through; M3 PR 2 dispatcher already routes single-procedure `media.movies.*` URLs to pops-media-api).

### PR 4 — Shim deletion

- Delete `apps/pops-api/src/modules/media/movies/service.ts` and `types.ts` (the shim files).
- Retarget any `types.ts` imports to `@pops/media-db`.
- Keep `router.ts` mounted on pops-api as the fall-through for batched URLs (per M3 deferral pattern from Theme 12).
- If broader consumer set blocks clean delete (e.g. `media.search` orchestrator still imports from the shim), defer with a docs-only runbook entry — same defer pattern as N3 PR 4 / M3 PR 3 / etc.

## Edge Cases

| Case                                                                                  | Behaviour                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pops.db.movies` has rows that don't exist in `media.db.movies` after migration       | Backfill catches them on next boot; idempotent.                                                                                                                                             |
| TMDB sync writes a movie row during the cutover window                                | Writes land where the active handle points; concurrent writes during the cutover PR's release are minimised because pops-worker doesn't write `movies` directly (it writes via the router). |
| Search adapter references `movies` after relocation but before pops-search-api (E08b) | Adapter import path updates as part of PR 3; pops-api search still works because it imports through the new package path.                                                                   |
| URI resolver `pops:media/movie/<id>` is called during the transition                  | URI handler is a stateless lookup against `getMediaDrizzle()` — works regardless of which container serves it.                                                                              |
| `media.movies.list` batched with `media.tvShows.list` (both unmigrated)               | Falls through to pops-api per the M3 PR 2 dispatcher rule; both queries succeed against `pops.db` via the legacy mounts. Batched calls keep working until E04 (batching fix) lands.         |
| Q1 schema-coverage CI fails because `movies` is in services but not migrations        | Caught at PR 1 review; resolved by including the table in the package's baseline.                                                                                                           |
| New column added to `movies` mid-flight                                               | Migration drifts. The drift-guard CI catches it during the transition window. Pattern: land the schema change in the shared journal first, sync to the package, then continue the cutover.  |

## User Stories

| #   | Story                                                       | Summary                                                                                                               | Parallelisable                                                                                    |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Add `movies` schema + baseline migration + service exports to `@pops/media-db`; extend backfill `TABLE_COPIES` | blocked by PRD-153 (contract package shape) only if movies-related types belong in media-contract |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop `movies` from shared journal; add drift-guard CI for media                                                | blocked by us-01                                                                                  |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip `media.movies.*` router to `getMediaDrizzle()`; relocate search adapter + URI handler                     | blocked by us-02                                                                                  |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer the shim files; retarget type imports; document if deferred                                    | blocked by us-03                                                                                  |

## Out of Scope

- Moving the _legacy_ `movies` mount off pops-api. The dispatcher routes single-procedure URLs to pops-media-api; batched URLs fall through. Genuine deletion of the pops-api mount happens after E04 (batching fix) lands.
- Refactoring the search adapter's relevance scoring. The adapter behaviour is preserved; only its location changes.
- AI categorisation of movies. Hooks remain in pops-worker; they call into the new path automatically because the database handle is the only thing that changes.
- Migrating `tvShows`, `watchlist`, `watchHistory`, etc. Each gets its own PRD (166-172).
- Renaming the `movies` table or changing its primary key. Pure schema move.
- Splitting `movies` into normalised sub-tables. Existing schema is preserved.
- TMDB / TVDB API integration changes. The worker keeps fetching from the same upstream; only its write target's handle changes.
- Pre-loading the `media.db` from a TMDB snapshot. Backfill from `pops.db` is the only data source.
- Dropping `movies` from `pops.db` itself. That's Epic 09's job.
