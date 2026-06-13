import { eq } from 'drizzle-orm';

import { debriefStatus } from '@pops/cerebrum-db';
import { comparisonDimensions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';

/**
 * Queue debrief status rows for a media item — one per active dimension.
 *
 * Side-by-side handles (Theme-13 Wave-5 cascade): `comparison_dimensions`
 * still lives on the shared `pops.db` and is read through `getDrizzle()`;
 * the `debrief_status` upserts target the cerebrum handle. On conflict
 * (re-watch), `debriefed` / `dismissed` reset to 0 so the user is prompted
 * to debrief again.
 */
export function queueDebriefStatus(mediaType: string, mediaId: number): number {
  const sharedDb = getDrizzle();
  const cerebrumDb = getCerebrumDrizzle();

  const dims = sharedDb
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
