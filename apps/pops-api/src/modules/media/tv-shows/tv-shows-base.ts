/**
 * TV shows wrapper — resolves the media-pillar drizzle handle and forwards
 * to `@pops/media-db`'s `tvShowsService` (PRD-166 cutover).
 *
 * Mirrors the movies PR 3 pattern: in-tree callers (router.ts,
 * library/tv-show-service.ts, plex sync helpers, watchlist push,
 * thetvdb service + refresh-episodes, …) keep importing from
 * `./tv-shows/service.js` unchanged. The handle now points at the media
 * pillar's per-pillar SQLite via `getMediaDrizzle()` instead of the
 * shared `pops.db` singleton, so every tv-shows write through this
 * wrapper lands in `media.db.tv_shows`.
 *
 * Cross-store consistency during the migration window:
 *  - `backfillMediaFromShared()` runs at boot and is one-way only
 *    (pops.db → media.db, idempotent via NOT IN id filter). It does NOT
 *    keep the two stores in sync at runtime; it only catches media.db
 *    up to pops.db on each restart.
 *  - In-tree code paths that still write tv_shows to the shared
 *    `pops.db` (notably `library/tv-show-service.ts` for plex/library
 *    ingestion, and `seasons-service.ts` / `episodes-service.ts` whose
 *    FK parents live on the legacy mount) remain the source of truth
 *    for `seasons.tv_show_id` and `episodes.season_id` joins. Until
 *    those slices ship to `@pops/media-db`, the seasons/episodes
 *    services intentionally read+write the shared DB so their FK joins
 *    resolve in one store, and the boot-time backfill carries rows
 *    written there into media.db on the next deploy.
 *  - This means a tv_show created via `createTvShow` (media.db only)
 *    will not satisfy an FK insert in `createSeason` (pops.db) until
 *    the seasons/episodes cutover ships. Callers that need both must
 *    keep going through the library ingestion path which writes to the
 *    shared DB; this wrapper is currently used by reads + the
 *    metadata-refresh writes that don't need new season FKs.
 *
 * Error translation: the package surface throws `TvShowNotFoundError` /
 * `TvShowConflictError`. We re-throw them as the in-tree `NotFoundError`
 * / `ConflictError` so the router's `instanceof` checks (and library /
 * plex callers that catch the same shapes) keep working without churn.
 *
 * Out of scope (per PRD-166): `seasons-service.ts` and
 * `episodes-service.ts` still route through `getDrizzle()`; they migrate
 * once their slices land in `@pops/media-db`.
 */
import {
  tvShowsService,
  TvShowConflictError,
  TvShowNotFoundError,
  type TvShowFilters,
  type TvShowListResult,
} from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { CreateTvShowInput, TvShowRow, UpdateTvShowInput } from './types.js';

export type { TvShowListResult };

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof TvShowNotFoundError) {
      throw new NotFoundError('TvShow', String(err.id));
    }
    if (err instanceof TvShowConflictError) {
      throw new ConflictError(`TV show with TVDB ID ${err.tvdbId} already exists`);
    }
    throw err;
  }
}

/** List TV shows with optional filters. */
export function listTvShows(
  filters: TvShowFilters,
  limit: number,
  offset: number
): TvShowListResult {
  return tvShowsService.listTvShows(getMediaDrizzle(), filters, limit, offset);
}

/** Get a single TV show by id. Throws `NotFoundError` if missing. */
export function getTvShow(id: number): TvShowRow {
  return translate(() => tvShowsService.getTvShow(getMediaDrizzle(), id));
}

/** Get a single TV show by TVDB ID. Returns `null` if not found. */
export function getTvShowByTvdbId(tvdbId: number): TvShowRow | null {
  return tvShowsService.getTvShowByTvdbId(getMediaDrizzle(), tvdbId);
}

/** Create a new TV show. Throws `ConflictError` on duplicate tvdbId. */
export function createTvShow(input: CreateTvShowInput): TvShowRow {
  return translate(() => tvShowsService.createTvShow(getMediaDrizzle(), input));
}

/** Update an existing TV show. Throws `NotFoundError` if missing. */
export function updateTvShow(id: number, input: UpdateTvShowInput): TvShowRow {
  return translate(() => tvShowsService.updateTvShow(getMediaDrizzle(), id, input));
}

/** Delete a TV show by id. Throws `NotFoundError` if missing. */
export function deleteTvShow(id: number): void {
  translate(() => tvShowsService.deleteTvShow(getMediaDrizzle(), id));
}
