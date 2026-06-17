/**
 * Runtime + miscellaneous local-shelf queries: short watches, long epics,
 * franchise completions (unwatched in already-watched genres), and the
 * leaving-soon rotation shelf.
 *
 * HTTP-free, `(db, …)` arg. Ported from the monolith `local-runtime-shelves.ts`
 * + `local-misc-shelves.ts`.
 */
import { and, eq, gt, isNotNull, lt, sql } from 'drizzle-orm';

import { movies, watchHistory } from '../../schema.js';
import { localMovieCols, toLocalResult } from './local-shelf-row.js';

import type { MediaDb } from '../internal.js';
import type { DiscoverResult } from './types.js';

const NOT_WATCHED = sql`NOT EXISTS (
  SELECT 1 FROM watch_history
  WHERE watch_history.media_type = 'movie'
  AND watch_history.media_id = movies.id
)`;

/** Unwatched movies under 100 minutes, best-rated first. */
export function getShortWatches(db: MediaDb, limit: number, offset: number): DiscoverResult[] {
  const rows = db
    .select(localMovieCols)
    .from(movies)
    .where(and(isNotNull(movies.runtime), lt(movies.runtime, 100), NOT_WATCHED))
    .orderBy(sql`${movies.voteAverage} DESC NULLS LAST`)
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map(toLocalResult);
}

/** Unwatched movies over 150 minutes, best-rated first. */
export function getLongEpics(db: MediaDb, limit: number, offset: number): DiscoverResult[] {
  const rows = db
    .select(localMovieCols)
    .from(movies)
    .where(and(isNotNull(movies.runtime), gt(movies.runtime, 150), NOT_WATCHED))
    .orderBy(sql`${movies.voteAverage} DESC NULLS LAST`)
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map(toLocalResult);
}

/** Distinct genre names across all watched movies. */
export function getWatchedGenres(db: MediaDb): Set<string> {
  const rows = db
    .select({ genres: movies.genres })
    .from(movies)
    .innerJoin(
      watchHistory,
      and(eq(watchHistory.mediaType, 'movie'), eq(watchHistory.mediaId, movies.id))
    )
    .where(isNotNull(movies.genres))
    .all();

  const watchedGenres = new Set<string>();
  for (const row of rows) {
    if (!row.genres) continue;
    try {
      for (const g of JSON.parse(row.genres) as string[]) watchedGenres.add(g);
    } catch {
      continue;
    }
  }
  return watchedGenres;
}

/**
 * Unwatched movies sharing a genre with something the user has watched.
 * Over-fetches then filters in JS (genre membership is a JSON-array test).
 */
export function getFranchiseCompletions(
  db: MediaDb,
  limit: number,
  offset: number
): DiscoverResult[] {
  const watchedGenres = getWatchedGenres(db);
  if (watchedGenres.size === 0) return [];

  const rows = db
    .select(localMovieCols)
    .from(movies)
    .where(and(isNotNull(movies.genres), NOT_WATCHED))
    .orderBy(sql`${movies.voteAverage} DESC NULLS LAST`)
    .limit(limit * 5)
    .all();

  const filtered = rows.filter((r) => {
    if (!r.genres) return false;
    try {
      return (JSON.parse(r.genres) as string[]).some((g) => watchedGenres.has(g));
    } catch {
      return false;
    }
  });
  return filtered.slice(offset, offset + limit).map(toLocalResult);
}

/** Whether any movie is currently marked as leaving rotation. */
export function hasLeavingMovies(db: MediaDb): boolean {
  const rows = db
    .select({ id: movies.id })
    .from(movies)
    .where(eq(movies.rotationStatus, 'leaving'))
    .limit(1)
    .all();
  return rows.length > 0;
}

/** Movies marked as leaving rotation, soonest expiry first, with the expiry stamp. */
export function getLeavingSoonMovies(db: MediaDb, limit: number, offset: number): DiscoverResult[] {
  const rows = db
    .select({ ...localMovieCols, rotationExpiresAt: movies.rotationExpiresAt })
    .from(movies)
    .where(eq(movies.rotationStatus, 'leaving'))
    .orderBy(sql`${movies.rotationExpiresAt} ASC NULLS LAST`)
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map((r) => ({
    ...toLocalResult(r),
    rotationExpiresAt: r.rotationExpiresAt ?? undefined,
  }));
}
