import { comparisons, movies } from '@pops/db-types';
import { and, count, desc, eq, inArray, like, or, type SQL } from 'drizzle-orm';

import { getDrizzle } from '../../../../db.js';
import type { ComparisonRow } from '../types.js';

export interface ComparisonListResult {
  rows: ComparisonRow[];
  total: number;
}

/**
 * Normalize pair ordering so A-vs-B and B-vs-A map to the same row.
 * Sorts by (mediaType, mediaId) to ensure consistent key.
 */
export function normalizePairOrder(
  aType: string,
  aId: number,
  bType: string,
  bId: number
): [string, number, string, number] {
  const keyA = `${aType}:${aId}`;
  const keyB = `${bType}:${bId}`;
  if (keyA <= keyB) return [aType, aId, bType, bId];
  return [bType, bId, aType, aId];
}

/**
 * Find an existing comparison for the same normalized pair on a dimension.
 * Returns the row if found, undefined otherwise.
 */
export function findExistingComparison(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): ComparisonRow | undefined {
  const drizzleDb = getDrizzle();
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );
  return drizzleDb
    .select()
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        or(
          and(
            eq(comparisons.mediaAType, normAType),
            eq(comparisons.mediaAId, normAId),
            eq(comparisons.mediaBType, normBType),
            eq(comparisons.mediaBId, normBId)
          ),
          and(
            eq(comparisons.mediaAType, normBType),
            eq(comparisons.mediaAId, normBId),
            eq(comparisons.mediaBType, normAType),
            eq(comparisons.mediaBId, normAId)
          )
        )
      )
    )
    .get();
}

export function listComparisonsForMedia(
  mediaType: string,
  mediaId: number,
  dimensionId: number | undefined,
  limit: number,
  offset: number
): ComparisonListResult {
  const db = getDrizzle();

  const mediaCondition = or(
    and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
    and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
  );

  const conditions = dimensionId
    ? and(mediaCondition, eq(comparisons.dimensionId, dimensionId))
    : mediaCondition;

  const rows = db
    .select()
    .from(comparisons)
    .where(conditions)
    .orderBy(desc(comparisons.comparedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(comparisons).where(conditions).all()[0];
  const total = countRow?.total ?? 0;

  return { rows, total };
}

/**
 * List all comparisons across all dimensions, ordered by most recent first.
 */
export function listAllComparisons(
  dimensionId: number | undefined,
  search: string | undefined,
  limit: number,
  offset: number
): ComparisonListResult {
  const db = getDrizzle();

  const conditions: SQL[] = [];
  if (dimensionId) conditions.push(eq(comparisons.dimensionId, dimensionId));
  if (search) {
    const matchingIds = db
      .select({ id: movies.id })
      .from(movies)
      .where(like(movies.title, `%${search}%`))
      .all()
      .map((r) => r.id);
    if (matchingIds.length === 0) return { rows: [], total: 0 };
    const movieFilter = or(
      inArray(comparisons.mediaAId, matchingIds),
      inArray(comparisons.mediaBId, matchingIds)
    );
    if (movieFilter) conditions.push(movieFilter);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(comparisons)
    .where(where)
    .orderBy(desc(comparisons.comparedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(comparisons).where(where).all()[0];
  const total = countRow?.total ?? 0;

  return { rows, total };
}
