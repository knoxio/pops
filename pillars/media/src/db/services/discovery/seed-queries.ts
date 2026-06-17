/**
 * Seed-selection queries for the seeded shelves (because-you-watched,
 * credits) and the TMDB-source shelves (recommendations, watchlist).
 *
 * HTTP-free, `(db, …)` arg. Ported from the monolith
 * `because-you-watched.shelf.ts`, `credits-shelves.ts`, `tmdb-service.ts`,
 * and `tmdb-shelves-helpers.ts` query helpers.
 */
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { mediaScores, mediaWatchlist, movies, watchHistory } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export interface WatchedSeedMovie {
  id: number;
  tmdbId: number;
  title: string;
  genres: string;
  avgEloScore: number | null;
  watchedAt: string;
}

export interface EloSeedMovie {
  id: number;
  tmdbId: number;
  title: string;
  avgEloScore: number | null;
}

export interface SourceMovie {
  tmdbId: number;
  title: string;
}

/** Completed movie watches with avg ELO + last-watched timestamp, newest first. */
export function getWatchedSeeds(db: MediaDb): WatchedSeedMovie[] {
  const rows = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      genres: movies.genres,
      avgEloScore: sql<number | null>`ROUND(AVG(${mediaScores.score}), 1)`,
      watchedAt: sql<string>`MAX(${watchHistory.watchedAt})`,
    })
    .from(watchHistory)
    .innerJoin(
      movies,
      and(eq(movies.id, watchHistory.mediaId), eq(watchHistory.mediaType, 'movie'))
    )
    .leftJoin(
      mediaScores,
      and(eq(mediaScores.mediaId, movies.id), eq(mediaScores.mediaType, 'movie'))
    )
    .where(eq(watchHistory.completed, 1))
    .groupBy(movies.id)
    .orderBy(sql`MAX(${watchHistory.watchedAt}) DESC`)
    .all();
  return rows.map((r) => ({ ...r, genres: r.genres ?? '[]' }));
}

/** Every library movie with its avg ELO score (null when never compared). */
export function getEloSeedMovies(db: MediaDb): EloSeedMovie[] {
  return db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      avgEloScore: sql<number | null>`ROUND(AVG(${mediaScores.score}), 1)`,
    })
    .from(movies)
    .leftJoin(mediaScores, eq(mediaScores.mediaId, movies.id))
    .groupBy(movies.id)
    .all();
}

/** Top-rated library movies by TMDB vote average — the recommendation seeds. */
export function getTopRatedSourceMovies(db: MediaDb, limit: number): SourceMovie[] {
  return db
    .select({ tmdbId: movies.tmdbId, title: movies.title })
    .from(movies)
    .where(isNotNull(movies.voteAverage))
    .orderBy(desc(movies.voteAverage))
    .limit(limit)
    .all();
}

/** Up to 10 most recently added movie watchlist items — the similar-to seeds. */
export function getRecentWatchlistSourceMovies(db: MediaDb): SourceMovie[] {
  return db
    .select({ tmdbId: movies.tmdbId, title: movies.title })
    .from(mediaWatchlist)
    .innerJoin(movies, eq(movies.id, mediaWatchlist.mediaId))
    .where(eq(mediaWatchlist.mediaType, 'movie'))
    .orderBy(desc(mediaWatchlist.addedAt))
    .limit(10)
    .all();
}

/** The decade (e.g. 1990) with the most completed movie watches; defaults to 1990. */
export function getMostWatchedDecade(db: MediaDb): number {
  const rows = db
    .select({
      decade: sql<number>`CAST(SUBSTR(${movies.releaseDate}, 1, 3) AS INTEGER) * 10`,
      watchCount: sql<number>`COUNT(*)`,
    })
    .from(watchHistory)
    .innerJoin(movies, sql`${movies.id} = ${watchHistory.mediaId}`)
    .where(
      sql`${watchHistory.mediaType} = 'movie' AND ${watchHistory.completed} = 1 AND ${movies.releaseDate} IS NOT NULL AND LENGTH(${movies.releaseDate}) >= 4`
    )
    .groupBy(sql`CAST(SUBSTR(${movies.releaseDate}, 1, 3) AS INTEGER) * 10`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(1)
    .all();
  return rows[0]?.decade ?? 1990;
}
