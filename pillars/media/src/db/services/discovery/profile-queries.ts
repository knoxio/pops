/**
 * The four SQL aggregations behind the preference profile.
 *
 * Each takes a `MediaDb` handle and is HTTP-free. Split from
 * `preference-profile.ts` so the builder stays a thin composition and each
 * query keeps a single responsibility. Ported from the monolith
 * `service-preference-profile.ts`, repointed onto the pillar's schema barrel.
 */
import { and, count, desc, eq, sql } from 'drizzle-orm';

import {
  comparisonDimensions,
  comparisons,
  mediaScores,
  movies,
  watchHistory,
} from '../../schema.js';

import type { MediaDb } from '../internal.js';
import type { DimensionWeight, GenreAffinity, GenreDistribution } from './types.js';

/** Per-genre average ELO score across the library, ordered by affinity. */
export function getGenreAffinities(db: MediaDb): GenreAffinity[] {
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

/** Each active comparison dimension, weighted by how many comparisons it has. */
export function getDimensionWeights(db: MediaDb): DimensionWeight[] {
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

/** Distribution of watched movies by genre, plus the total distinct movies watched. */
export function getGenreDistribution(db: MediaDb): {
  genres: GenreDistribution[];
  totalWatched: number;
} {
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

/** Total recorded comparisons — the cold-start signal for recommendations. */
export function getTotalComparisons(db: MediaDb): number {
  const [result] = db.select({ cnt: count() }).from(comparisons).all();
  return result?.cnt ?? 0;
}
