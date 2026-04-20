import { and, count, desc, eq, sql } from 'drizzle-orm';

import {
  comparisonDimensions,
  comparisons,
  mediaScores,
  movies,
  watchHistory,
} from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

import type {
  DimensionWeight,
  GenreAffinity,
  GenreDistribution,
  PreferenceProfile,
} from './types.js';

function getGenreAffinities(): GenreAffinity[] {
  const db = getDrizzle();
  return db
    .select({
      genre: sql<string>`g.value`,
      avgScore: sql<number>`ROUND(AVG(${mediaScores.score}), 1)`,
      movieCount: sql<number>`COUNT(DISTINCT ${movies.id})`,
      totalComparisons: sql<number>`COALESCE(SUM(${mediaScores.comparisonCount}), 0)`,
    })
    .from(movies)
    .innerJoin(sql`json_each(${movies.genres}) g`, sql`1=1`)
    .innerJoin(
      mediaScores,
      and(eq(mediaScores.mediaType, 'movie'), eq(mediaScores.mediaId, movies.id))
    )
    .groupBy(sql`g.value`)
    .orderBy(desc(sql`ROUND(AVG(${mediaScores.score}), 1)`))
    .all() as GenreAffinity[];
}

function getDimensionWeights(): DimensionWeight[] {
  const db = getDrizzle();
  const compCountExpr = sql<number>`COALESCE(SUM(${mediaScores.comparisonCount}), 0)`;
  return db
    .select({
      dimensionId: comparisonDimensions.id,
      name: comparisonDimensions.name,
      comparisonCount: compCountExpr,
      avgScore: sql<number>`ROUND(AVG(${mediaScores.score}), 1)`,
    })
    .from(comparisonDimensions)
    .leftJoin(mediaScores, eq(mediaScores.dimensionId, comparisonDimensions.id))
    .where(eq(comparisonDimensions.active, 1))
    .groupBy(comparisonDimensions.id, comparisonDimensions.name)
    .orderBy(desc(compCountExpr))
    .all() as DimensionWeight[];
}

function getGenreDistribution(): { genres: GenreDistribution[]; totalWatched: number } {
  const db = getDrizzle();
  const [totalResult] = db
    .select({ cnt: sql<number>`COUNT(DISTINCT ${watchHistory.mediaId})` })
    .from(watchHistory)
    .where(eq(watchHistory.mediaType, 'movie'))
    .all();

  const totalWatched = totalResult?.cnt ?? 0;
  if (totalWatched === 0) return { genres: [], totalWatched: 0 };

  const rows = db
    .select({
      genre: sql<string>`g.value`,
      watchCount: sql<number>`COUNT(DISTINCT ${watchHistory.mediaId})`,
    })
    .from(watchHistory)
    .innerJoin(
      movies,
      and(eq(movies.id, watchHistory.mediaId), eq(watchHistory.mediaType, 'movie'))
    )
    .innerJoin(sql`json_each(${movies.genres}) g`, sql`1=1`)
    .groupBy(sql`g.value`)
    .orderBy(desc(sql`COUNT(DISTINCT ${watchHistory.mediaId})`))
    .all() as { genre: string; watchCount: number }[];

  const genres: GenreDistribution[] = rows.map((row) => ({
    genre: row.genre,
    watchCount: row.watchCount,
    percentage: Math.round((row.watchCount / totalWatched) * 100),
  }));

  return { genres, totalWatched };
}

function getTotalComparisons(): number {
  const db = getDrizzle();
  const [result] = db.select({ cnt: count() }).from(comparisons).all();
  return result?.cnt ?? 0;
}

/** Compute the full preference profile on demand. */
export function getPreferenceProfile(): PreferenceProfile {
  const genreAffinities = getGenreAffinities();
  const dimensionWeights = getDimensionWeights();
  const { genres: genreDistribution, totalWatched } = getGenreDistribution();
  const totalComparisons = getTotalComparisons();
  return {
    genreAffinities,
    dimensionWeights,
    genreDistribution,
    totalMoviesWatched: totalWatched,
    totalComparisons,
  };
}
