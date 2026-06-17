/**
 * Read media scores for a media item. HTTP-free, `(db, …)` arg.
 */
import { and, desc, eq } from 'drizzle-orm';

import { mediaScores } from '../../schema.js';

import type { MediaScoreRow } from '../../row-types.js';
import type { MediaDb } from '../internal.js';

/** Scores for a media item, highest first, optionally filtered to one dimension. */
export function getScoresForMedia(
  db: MediaDb,
  mediaType: string,
  mediaId: number,
  dimensionId?: number
): MediaScoreRow[] {
  const conditions = [eq(mediaScores.mediaType, mediaType), eq(mediaScores.mediaId, mediaId)];
  if (dimensionId) conditions.push(eq(mediaScores.dimensionId, dimensionId));

  return db
    .select()
    .from(mediaScores)
    .where(and(...conditions))
    .orderBy(desc(mediaScores.score))
    .all();
}
