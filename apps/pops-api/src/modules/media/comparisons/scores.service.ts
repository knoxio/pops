import { and, desc, eq } from 'drizzle-orm';

import { mediaScores } from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';

import type { MediaScoreRow } from './types.js';

export function getScoresForMedia(
  mediaType: string,
  mediaId: number,
  dimensionId?: number
): MediaScoreRow[] {
  const db = getMediaDrizzle();

  const conditions = [eq(mediaScores.mediaType, mediaType), eq(mediaScores.mediaId, mediaId)];
  if (dimensionId) {
    conditions.push(eq(mediaScores.dimensionId, dimensionId));
  }

  return db
    .select()
    .from(mediaScores)
    .where(and(...conditions))
    .orderBy(desc(mediaScores.score))
    .all();
}
