/**
 * Dimension-driven seed queries for the top-dimension / dimension-inspired
 * shelves: the top-rated movies for a comparison dimension, and the single
 * highest-scoring movie used as a TMDB-recommendation seed.
 *
 * HTTP-free, `(db, …)` arg. Ported from the monolith `top-dimension.shelf.ts`
 * + `dimension-inspired.shelf.ts` query helpers.
 */
import { and, desc, eq } from 'drizzle-orm';

import { mediaScores, movies } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export interface DimensionTopMovie {
  movieId: number;
  tmdbId: number;
  title: string;
  score: number;
}

export interface DimensionSeedMovie {
  movieId: number;
  tmdbId: number;
  title: string;
}

/** Highest-scoring movies for a dimension, score descending, `limit` rows. */
export function getTopMoviesForDimension(
  db: MediaDb,
  dimensionId: number,
  limit: number
): DimensionTopMovie[] {
  return db
    .select({
      movieId: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      score: mediaScores.score,
    })
    .from(mediaScores)
    .innerJoin(movies, and(eq(movies.id, mediaScores.mediaId), eq(mediaScores.mediaType, 'movie')))
    .where(eq(mediaScores.dimensionId, dimensionId))
    .orderBy(desc(mediaScores.score))
    .limit(limit)
    .all();
}

/** The single highest-scoring movie for a dimension, or null when none scored. */
export function getHighScoringMovieForDimension(
  db: MediaDb,
  dimensionId: number
): DimensionSeedMovie | null {
  const rows = db
    .select({
      movieId: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
    })
    .from(mediaScores)
    .innerJoin(movies, and(eq(movies.id, mediaScores.mediaId), eq(mediaScores.mediaType, 'movie')))
    .where(eq(mediaScores.dimensionId, dimensionId))
    .orderBy(desc(mediaScores.score))
    .limit(1)
    .all();
  return rows[0] ?? null;
}
