import { and, eq, or } from 'drizzle-orm';

import { comparisons } from '@pops/db-types';
import { mediaScores } from '@pops/media-db';

import { getDb, getDrizzle } from '../../../../db.js';
import { getMediaDrizzle } from '../../../../db/media-db-handle.js';
import { NotFoundError } from '../../../../shared/errors.js';
import { getDimension } from '../dimensions.service.js';
import { recalcDimensionElo } from './score-management.js';

/**
 * Exclude a media item from a dimension: sets excluded=1 on the media_scores row
 * (creates with score 1500 + excluded=1 if missing), deletes all comparisons
 * involving that item for this dimension, and recalculates ELO.
 */
export function excludeFromDimension(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): { comparisonsDeleted: number } {
  getDimension(dimensionId); // verify exists
  const mediaDb = getMediaDrizzle();
  const sharedDb = getDrizzle();
  const rawDb = getDb();

  let comparisonsDeleted = 0;

  rawDb.transaction(() => {
    const existing = mediaDb
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
      mediaDb
        .update(mediaScores)
        .set({ excluded: 1, updatedAt: new Date().toISOString() })
        .where(eq(mediaScores.id, existing.id))
        .run();
    } else {
      mediaDb
        .insert(mediaScores)
        .values({
          mediaType,
          mediaId,
          dimensionId,
          score: 1500.0,
          comparisonCount: 0,
          excluded: 1,
        })
        .run();
    }

    const result = sharedDb
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

    recalcDimensionElo(dimensionId);
  })();

  return { comparisonsDeleted };
}

/**
 * Re-include a media item in a dimension: sets excluded=0.
 */
export function includeInDimension(mediaType: string, mediaId: number, dimensionId: number): void {
  getDimension(dimensionId); // verify exists
  const drizzleDb = getMediaDrizzle();

  const existing = drizzleDb
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

  if (!existing) {
    throw new NotFoundError('MediaScore', `${mediaType}:${mediaId}:${dimensionId}`);
  }

  drizzleDb
    .update(mediaScores)
    .set({ excluded: 0, updatedAt: new Date().toISOString() })
    .where(eq(mediaScores.id, existing.id))
    .run();
}
