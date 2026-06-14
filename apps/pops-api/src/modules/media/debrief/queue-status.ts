import { eq } from 'drizzle-orm';

import { debriefStatus } from '@pops/cerebrum-db';
import { comparisonDimensions } from '@pops/media-db';

import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { getMediaDrizzle } from '../../../db/media-db-handle.js';

/**
 * Queue debrief status rows for a media item — one per active dimension.
 *
 * Side-by-side handles (Theme-13 Wave-5 cascade): `comparison_dimensions`
 * lives on the media handle (closing the cross-pillar JOIN that previously
 * routed through the shared `pops.db`); the `debrief_status` upserts target
 * the cerebrum handle. On conflict (re-watch), `debriefed` / `dismissed`
 * reset to 0 so the user is prompted to debrief again.
 */
export function queueDebriefStatus(mediaType: string, mediaId: number): number {
  const mediaDb = getMediaDrizzle();
  const cerebrumDb = getCerebrumDrizzle();

  const dims = mediaDb
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  if (dims.length === 0) return 0;

  const now = new Date().toISOString();
  for (const dim of dims) {
    cerebrumDb
      .insert(debriefStatus)
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
