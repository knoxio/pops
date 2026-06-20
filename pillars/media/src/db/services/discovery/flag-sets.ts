/**
 * TMDB-id flag sets used by the discovery pipeline to annotate and filter
 * discover results: which TMDB ids are in the library, watched, or on the
 * watchlist.
 *
 * HTTP-free, `(db, …)` arg. The dismissed-id set lives in
 * `dismissed-discover.ts` (`getDismissedTmdbIdSet`) and is reused as-is.
 * Ported from the monolith `discovery/flags.ts` + `tmdb-service.getLibraryTmdbIds`.
 */
import { eq } from 'drizzle-orm';

import { mediaWatchlist, movies, watchHistory } from '../../schema.js';

import type { MediaDb } from '../internal.js';

/** Every TMDB id currently in the library, for O(1) membership checks. */
export function getLibraryTmdbIdSet(db: MediaDb): Set<number> {
  const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  return new Set(rows.map((r) => r.tmdbId));
}

/** TMDB ids of every movie with a watch_history entry. */
export function getWatchedTmdbIdSet(db: MediaDb): Set<number> {
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(watchHistory)
    .innerJoin(movies, eq(movies.id, watchHistory.mediaId))
    .where(eq(watchHistory.mediaType, 'movie'))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

/** TMDB ids of every movie currently on the watchlist. */
export function getWatchlistTmdbIdSet(db: MediaDb): Set<number> {
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(mediaWatchlist)
    .innerJoin(movies, eq(movies.id, mediaWatchlist.mediaId))
    .where(eq(mediaWatchlist.mediaType, 'movie'))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}
