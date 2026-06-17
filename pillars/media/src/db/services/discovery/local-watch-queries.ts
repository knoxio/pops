/**
 * Watch-state local-shelf queries: comfort picks (rewatched), undiscovered
 * (never watched, never scored), and recently-added (unwatched, newest first).
 *
 * HTTP-free, `(db, …)` arg. Ported from the monolith `local-watch-shelves.ts`.
 */
import { and, eq, sql } from 'drizzle-orm';

import { mediaScores, movies, watchHistory } from '../../schema.js';
import { localMovieCols, toLocalResult } from './local-shelf-row.js';

import type { MediaDb } from '../internal.js';
import type { DiscoverResult } from './types.js';

/** Movies with 2+ watch-history entries, most-watched first. */
export function getComfortPicks(db: MediaDb, limit: number, offset: number): DiscoverResult[] {
  const rows = db
    .select({ ...localMovieCols, watchCount: sql<number>`COUNT(${watchHistory.id})` })
    .from(movies)
    .innerJoin(
      watchHistory,
      and(eq(watchHistory.mediaType, 'movie'), eq(watchHistory.mediaId, movies.id))
    )
    .groupBy(movies.id)
    .having(sql`COUNT(${watchHistory.id}) >= 2`)
    .orderBy(sql`COUNT(${watchHistory.id}) DESC`)
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map((r) => ({ ...toLocalResult(r), isWatched: true }));
}

/** Library movies with no watch-history and no scores, newest first. */
export function getUndiscoveredMovies(
  db: MediaDb,
  limit: number,
  offset: number
): DiscoverResult[] {
  const rows = db
    .select(localMovieCols)
    .from(movies)
    .where(
      sql`NOT EXISTS (
        SELECT 1 FROM ${watchHistory}
        WHERE ${watchHistory.mediaType} = 'movie'
        AND ${watchHistory.mediaId} = ${movies.id}
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${mediaScores}
        WHERE ${mediaScores.mediaType} = 'movie'
        AND ${mediaScores.mediaId} = ${movies.id}
      )`
    )
    .orderBy(sql`${movies.createdAt} DESC`)
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map(toLocalResult);
}

/** Unwatched library movies, most recently added first. */
export function getRecentlyAddedMovies(
  db: MediaDb,
  limit: number,
  offset: number
): DiscoverResult[] {
  const rows = db
    .select(localMovieCols)
    .from(movies)
    .where(
      sql`NOT EXISTS (
        SELECT 1 FROM ${watchHistory}
        WHERE ${watchHistory.mediaType} = 'movie'
        AND ${watchHistory.mediaId} = ${movies.id}
      )`
    )
    .orderBy(sql`${movies.createdAt} DESC`)
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map(toLocalResult);
}
