/**
 * Comparison read queries + pair-order normalization. HTTP-free, `(db, …)` arg.
 */
import { and, count, desc, eq, inArray, like, or, type SQL } from 'drizzle-orm';

import { comparisons, movies } from '../../schema.js';

import type { ComparisonRow } from '../../row-types.js';
import type { MediaDb } from '../internal.js';

export interface ComparisonListResult {
  rows: ComparisonRow[];
  total: number;
}

/**
 * Normalize pair ordering so A-vs-B and B-vs-A map to the same key. Sorts by
 * `(mediaType, mediaId)` lexically.
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

export interface FindExistingComparisonInput {
  dimensionId: number;
  mediaAType: string;
  mediaAId: number;
  mediaBType: string;
  mediaBId: number;
}

/** Find an existing comparison for the same normalized pair on a dimension. */
export function findExistingComparison(
  db: MediaDb,
  input: FindExistingComparisonInput
): ComparisonRow | undefined {
  const { dimensionId, mediaAType, mediaAId, mediaBType, mediaBId } = input;
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );
  return db
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

export interface ListComparisonsForMediaInput {
  mediaType: string;
  mediaId: number;
  dimensionId?: number | undefined;
  limit: number;
  offset: number;
}

/** List comparisons involving a media item, newest first. */
export function listComparisonsForMedia(
  db: MediaDb,
  input: ListComparisonsForMediaInput
): ComparisonListResult {
  const { mediaType, mediaId, dimensionId, limit, offset } = input;

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
  return { rows, total: countRow?.total ?? 0 };
}

export interface ListAllComparisonsInput {
  dimensionId?: number | undefined;
  search?: string | undefined;
  limit: number;
  offset: number;
}

/** List all comparisons (optional dimension + movie-title search), newest first. */
export function listAllComparisons(
  db: MediaDb,
  input: ListAllComparisonsInput
): ComparisonListResult {
  const { dimensionId, search, limit, offset } = input;
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
  return { rows, total: countRow?.total ?? 0 };
}

/** Total number of comparison rows across all dimensions. */
export function getGlobalComparisonCount(db: MediaDb): number {
  const row = db.select({ cnt: count() }).from(comparisons).get();
  return row?.cnt ?? 0;
}
