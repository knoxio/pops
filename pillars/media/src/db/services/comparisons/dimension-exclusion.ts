/**
 * Exclude / re-include a media item from a dimension. HTTP-free, `(db, …)` arg.
 */
import { and, eq, or } from 'drizzle-orm';

import { comparisons, mediaScores } from '../../schema.js';
import { getDefaultScore } from './config.js';
import { getDimension } from './dimensions.js';
import { MediaScoreNotFoundError } from './errors.js';
import { recalcDimensionElo } from './score-management.js';

import type { MediaDb } from '../internal.js';

/**
 * Exclude a media item from a dimension: set `excluded=1` on its score row
 * (creating it at baseline if missing), delete all comparisons involving it
 * for this dimension, and replay-recalculate.
 */
export function excludeFromDimension(
  db: MediaDb,
  mediaType: string,
  mediaId: number,
  dimensionId: number
): { comparisonsDeleted: number } {
  getDimension(db, dimensionId);

  let comparisonsDeleted = 0;

  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, mediaType),
          eq(mediaScores.mediaId, mediaId),
          eq(mediaScores.dimensionId, dimensionId)
        )
      )
      .get();

    if (existing) {
      tx.update(mediaScores)
        .set({ excluded: 1, updatedAt: new Date().toISOString() })
        .where(eq(mediaScores.id, existing.id))
        .run();
    } else {
      tx.insert(mediaScores)
        .values({
          mediaType,
          mediaId,
          dimensionId,
          score: getDefaultScore(),
          comparisonCount: 0,
          excluded: 1,
        })
        .run();
    }

    const result = tx
      .delete(comparisons)
      .where(
        and(
          eq(comparisons.dimensionId, dimensionId),
          or(
            and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
            and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
          )
        )
      )
      .run();

    comparisonsDeleted = result.changes;
    recalcDimensionElo(tx, dimensionId);
  });

  return { comparisonsDeleted };
}

/** Re-include a media item in a dimension: set `excluded=0`. */
export function includeInDimension(
  db: MediaDb,
  mediaType: string,
  mediaId: number,
  dimensionId: number
): void {
  getDimension(db, dimensionId);

  const existing = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId)
      )
    )
    .get();
  if (!existing) throw new MediaScoreNotFoundError(mediaType, mediaId, dimensionId);

  db.update(mediaScores)
    .set({ excluded: 0, updatedAt: new Date().toISOString() })
    .where(eq(mediaScores.id, existing.id))
    .run();
}
