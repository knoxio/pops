import { and, eq } from 'drizzle-orm';

import { comparisonSkipCooloffs } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getGlobalComparisonCount } from '../global-count.js';
import { normalizePairOrder } from './comparison-queries.js';

/**
 * Record a skip cooloff for a pair of media items in a dimension.
 * Sets skip_until = current global comparison count + 10.
 * Upserts if the pair already has a cooloff (extends it).
 */
export function recordSkip(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): number {
  const db = getDrizzle();
  const globalCount = getGlobalComparisonCount();
  const skipUntil = globalCount + 10;

  // Normalize pair ordering for consistent storage (lower id first)
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );

  // Upsert: insert or update skip_until if pair already exists
  const existing = db
    .select()
    .from(comparisonSkipCooloffs)
    .where(
      and(
        eq(comparisonSkipCooloffs.dimensionId, dimensionId),
        eq(comparisonSkipCooloffs.mediaAType, normAType),
        eq(comparisonSkipCooloffs.mediaAId, normAId),
        eq(comparisonSkipCooloffs.mediaBType, normBType),
        eq(comparisonSkipCooloffs.mediaBId, normBId)
      )
    )
    .get();

  if (existing) {
    db.update(comparisonSkipCooloffs)
      .set({ skipUntil })
      .where(eq(comparisonSkipCooloffs.id, existing.id))
      .run();
  } else {
    db.insert(comparisonSkipCooloffs)
      .values({
        dimensionId,
        mediaAType: normAType,
        mediaAId: normAId,
        mediaBType: normBType,
        mediaBId: normBId,
        skipUntil,
      })
      .run();
  }

  return skipUntil;
}

/**
 * Check if a pair is currently on cooloff for a dimension.
 * Returns true if global comparison count < skip_until.
 * Symmetric: A-vs-B matches B-vs-A.
 */
export function isPairOnCooloff(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): boolean {
  const db = getDrizzle();
  const globalCount = getGlobalComparisonCount();

  // Normalize pair ordering for consistent lookup
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );

  const cooloff = db
    .select()
    .from(comparisonSkipCooloffs)
    .where(
      and(
        eq(comparisonSkipCooloffs.dimensionId, dimensionId),
        eq(comparisonSkipCooloffs.mediaAType, normAType),
        eq(comparisonSkipCooloffs.mediaAId, normAId),
        eq(comparisonSkipCooloffs.mediaBType, normBType),
        eq(comparisonSkipCooloffs.mediaBId, normBId)
      )
    )
    .get();

  if (!cooloff) return false;
  return globalCount < cooloff.skipUntil;
}
