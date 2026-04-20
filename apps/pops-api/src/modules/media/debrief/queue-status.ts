import { eq } from 'drizzle-orm';

import { comparisonDimensions, debriefStatus } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

/**
 * Queue debrief status rows for a media item — one per active dimension.
 *
 * On conflict (re-watch), resets debriefed and dismissed to 0 so the
 * user is prompted to debrief again.
 */
export function queueDebriefStatus(mediaType: string, mediaId: number): number {
  const db = getDrizzle();

  const dims = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  if (dims.length === 0) return 0;

  const now = new Date().toISOString();
  for (const dim of dims) {
    db.insert(debriefStatus)
      .values({
        mediaType,
        mediaId,
        dimensionId: dim.id,
      })
      .onConflictDoUpdate({
        target: [debriefStatus.mediaType, debriefStatus.mediaId, debriefStatus.dimensionId],
        set: {
          debriefed: 0,
          dismissed: 0,
          updatedAt: now,
        },
      })
      .run();
  }

  return dims.length;
}
