/**
 * Skip cooloff — suppress a pair for 10 global comparisons after a skip.
 * HTTP-free, `(db, …)` arg.
 */
import { and, eq, type SQL } from 'drizzle-orm';

import { comparisonSkipCooloffs } from '../../schema.js';
import { getGlobalComparisonCount, normalizePairOrder } from './comparison-queries.js';

import type { MediaDb } from '../internal.js';

const COOLOFF_COMPARISONS = 10;

export interface SkipCooloffPair {
  dimensionId: number;
  mediaAType: string;
  mediaAId: number;
  mediaBType: string;
  mediaBId: number;
}

function pairWhere(input: SkipCooloffPair): SQL | undefined {
  const [aType, aId, bType, bId] = normalizePairOrder(
    input.mediaAType,
    input.mediaAId,
    input.mediaBType,
    input.mediaBId
  );
  return and(
    eq(comparisonSkipCooloffs.dimensionId, input.dimensionId),
    eq(comparisonSkipCooloffs.mediaAType, aType),
    eq(comparisonSkipCooloffs.mediaAId, aId),
    eq(comparisonSkipCooloffs.mediaBType, bType),
    eq(comparisonSkipCooloffs.mediaBId, bId)
  );
}

/**
 * Record a skip cooloff: `skip_until = current global comparison count + 10`.
 * Upserts — extends an existing cooloff for the same (normalized) pair.
 */
export function recordSkip(db: MediaDb, input: SkipCooloffPair): number {
  const skipUntil = getGlobalComparisonCount(db) + COOLOFF_COMPARISONS;
  const [aType, aId, bType, bId] = normalizePairOrder(
    input.mediaAType,
    input.mediaAId,
    input.mediaBType,
    input.mediaBId
  );

  const existing = db.select().from(comparisonSkipCooloffs).where(pairWhere(input)).get();
  if (existing) {
    db.update(comparisonSkipCooloffs)
      .set({ skipUntil })
      .where(eq(comparisonSkipCooloffs.id, existing.id))
      .run();
  } else {
    db.insert(comparisonSkipCooloffs)
      .values({
        dimensionId: input.dimensionId,
        mediaAType: aType,
        mediaAId: aId,
        mediaBType: bType,
        mediaBId: bId,
        skipUntil,
      })
      .run();
  }

  return skipUntil;
}

/** Whether a pair is currently on cooloff (symmetric A-vs-B / B-vs-A). */
export function isPairOnCooloff(db: MediaDb, input: SkipCooloffPair): boolean {
  const cooloff = db.select().from(comparisonSkipCooloffs).where(pairWhere(input)).get();
  if (!cooloff) return false;
  return getGlobalComparisonCount(db) < cooloff.skipUntil;
}
