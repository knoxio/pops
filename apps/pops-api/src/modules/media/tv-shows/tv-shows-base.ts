/**
 * TV shows wrapper — resolves the media-pillar drizzle handle and forwards
 * to `@pops/media-db`'s `tvShowsService` (PRD-166 cutover).
 *
 * Mirrors the movies PR 3 pattern: in-tree callers (router.ts,
 * library/tv-show-service.ts, plex sync helpers, watchlist push,
 * thetvdb service + refresh-episodes, …) keep importing from
 * `./tv-shows/service.js` unchanged. The handle now points at the media
 * pillar's per-pillar SQLite via `getMediaDrizzle()` instead of the
 * shared `pops.db` singleton, so every tv-shows write lands in
 * `media.db.tv_shows`. Reads issued from the legacy mount still serve
 * the same rows because the backfill keeps both stores in sync until
 * the shim retires.
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
