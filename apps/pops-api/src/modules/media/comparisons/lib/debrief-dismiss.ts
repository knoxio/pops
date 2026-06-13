import { and, count, eq } from 'drizzle-orm';

import { debriefResults, debriefSessions, debriefStatus } from '@pops/cerebrum-db';
import { comparisonDimensions } from '@pops/db-types';
import { watchHistory } from '@pops/media-db';

import { getDrizzle } from '../../../../db.js';
import { getCerebrumDrizzle } from '../../../../db/cerebrum-handle.js';
import { getMediaDrizzle } from '../../../../db/media-db-handle.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors.js';
import { getDimension } from '../dimensions.service.js';

function loadValidSession(sessionId: number): { watchHistoryId: number } {
  const db = getCerebrumDrizzle();
  const session = db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();
  if (!session) {
    throw new NotFoundError('Debrief session', String(sessionId));
  }
  if (session.status === 'complete') {
    throw new ValidationError(`Debrief session ${sessionId} is already complete`);
  }
  return { watchHistoryId: session.watchHistoryId };
}

function ensureNoExistingResult(sessionId: number, dimensionId: number): void {
  const db = getCerebrumDrizzle();
  const existing = db
    .select()
    .from(debriefResults)
    .where(
      and(eq(debriefResults.sessionId, sessionId), eq(debriefResults.dimensionId, dimensionId))
    )
    .get();
  if (existing) {
    throw new ConflictError(
      `Dimension ${dimensionId} already has a result for session ${sessionId}`
    );
  }
}

function markDebriefStatusDismissed(watchHistoryId: number, dimensionId: number): void {
  const mediaDb = getMediaDrizzle();
  const cerebrumDb = getCerebrumDrizzle();
  const watchEntry = mediaDb
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, watchHistoryId))
    .get();
  if (!watchEntry) return;
  cerebrumDb
    .update(debriefStatus)
    .set({ dismissed: 1 })
    .where(
      and(
        eq(debriefStatus.mediaType, watchEntry.mediaType),
        eq(debriefStatus.mediaId, watchEntry.mediaId),
        eq(debriefStatus.dimensionId, dimensionId)
      )
    )
    .run();
}

function autoCompleteIfFinished(sessionId: number): void {
  const sharedDb = getDrizzle();
  const cerebrumDb = getCerebrumDrizzle();
  const activeDims = sharedDb
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  const resultCount = cerebrumDb
    .select({ cnt: count() })
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .get();

  if (resultCount && resultCount.cnt >= activeDims.length) {
    cerebrumDb
      .update(debriefSessions)
      .set({ status: 'complete' })
      .where(eq(debriefSessions.id, sessionId))
      .run();
  }
}

/**
 * Dismiss a debrief dimension — inserts a debrief_result with comparison_id=null
 * (marks the dimension as skipped). Auto-completes the session when all active
 * dimensions have results.
 *
 * Theme-13 Wave-5 cascade: debrief* tables routed via `getCerebrumDrizzle()`;
 * `watch_history` lookup hops to `getMediaDrizzle()`; `comparison_dimensions`
 * stays on the shared `pops.db` until that slice cuts over.
 */
export function dismissDebriefDimension(sessionId: number, dimensionId: number): void {
  const db = getCerebrumDrizzle();
  const { watchHistoryId } = loadValidSession(sessionId);
  getDimension(dimensionId);
  ensureNoExistingResult(sessionId, dimensionId);
  db.insert(debriefResults).values({ sessionId, dimensionId, comparisonId: null }).run();
  markDebriefStatusDismissed(watchHistoryId, dimensionId);
  autoCompleteIfFinished(sessionId);
}
