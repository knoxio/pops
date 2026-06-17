/**
 * Score-driven local-shelf queries: polarizing picks (wide score spread) and
 * friend-proof (top-quartile entertainment + rewatchability).
 *
 * HTTP-free, `(db, …)` arg. Ported from the monolith `local-score-shelves.ts`.
 */
import { and, eq, sql } from 'drizzle-orm';

import { comparisonDimensions, mediaScores, movies } from '../../schema.js';
import { localMovieCols, toLocalResult } from './local-shelf-row.js';

import type { MediaDb } from '../internal.js';
import type { DiscoverResult } from './types.js';

/** Movies whose per-dimension scores span > 200 ELO, widest spread first. */
export function getPolarizingMovies(db: MediaDb, limit: number, offset: number): DiscoverResult[] {
  const rows = db
    .select({
      ...localMovieCols,
      scoreRange: sql<number>`ROUND(MAX(${mediaScores.score}) - MIN(${mediaScores.score}), 1)`,
    })
    .from(movies)
    .innerJoin(
      mediaScores,
      and(eq(mediaScores.mediaType, 'movie'), eq(mediaScores.mediaId, movies.id))
    )
    .groupBy(movies.id)
    .having(sql`MAX(${mediaScores.score}) - MIN(${mediaScores.score}) > 200`)
    .orderBy(sql`MAX(${mediaScores.score}) - MIN(${mediaScores.score}) DESC`)
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map((r) => ({ ...toLocalResult(r), isWatched: true }));
}

/**
 * Movies in the top quartile of average score across the Entertainment +
 * Rewatchability dimensions (must be scored on both).
 */
export function getFriendProofMovies(db: MediaDb, limit: number, offset: number): DiscoverResult[] {
  const allScored = db
    .select({
      ...localMovieCols,
      avgFriendScore: sql<number>`ROUND(AVG(${mediaScores.score}), 1)`,
    })
    .from(movies)
    .innerJoin(
      mediaScores,
      and(eq(mediaScores.mediaType, 'movie'), eq(mediaScores.mediaId, movies.id))
    )
    .innerJoin(
      comparisonDimensions,
      and(
        eq(comparisonDimensions.id, mediaScores.dimensionId),
        sql`${comparisonDimensions.name} IN ('Entertainment', 'Rewatchability')`
      )
    )
    .groupBy(movies.id)
    .having(sql`COUNT(DISTINCT ${comparisonDimensions.name}) = 2`)
    .orderBy(sql`AVG(${mediaScores.score}) DESC`)
    .all();

  const sorted = [...allScored].toSorted((a, b) => a.avgFriendScore - b.avgFriendScore);
  const p75Index = Math.floor(sorted.length * 0.75);
  const threshold = sorted[p75Index]?.avgFriendScore ?? 1500;
  const filtered = allScored.filter((r) => r.avgFriendScore >= threshold);
  return filtered
    .slice(offset, offset + limit)
    .map((r) => ({ ...toLocalResult(r), isWatched: true }));
}
