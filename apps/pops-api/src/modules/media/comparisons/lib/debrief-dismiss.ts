import { and, count, eq } from 'drizzle-orm';

import {
  comparisonDimensions,
  debriefResults,
  debriefSessions,
  debriefStatus,
  watchHistory,
} from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors.js';
import { getDimension } from '../dimensions.service.js';

function loadValidSession(sessionId: number): { watchHistoryId: number } {
  const db = getDrizzle();
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
  const db = getDrizzle();
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
  const db = getDrizzle();
  const watchEntry = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, watchHistoryId))
    .get();
  if (!watchEntry) return;
  db.update(debriefStatus)
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
  const db = getDrizzle();
  const activeDims = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  const resultCount = db
    .select({ cnt: count() })
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .get();

  if (resultCount && resultCount.cnt >= activeDims.length) {
    db.update(debriefSessions)
      .set({ status: 'complete' })
      .where(eq(debriefSessions.id, sessionId))
      .run();
  }
}

/**
 * Dismiss a debrief dimension — inserts a debrief_result with comparison_id=null
 * (marks the dimension as skipped). Auto-completes the session when all active
 * dimensions have results.
 */
export function dismissDebriefDimension(sessionId: number, dimensionId: number): void {
  const db = getDrizzle();
  const { watchHistoryId } = loadValidSession(sessionId);
  getDimension(dimensionId);
  ensureNoExistingResult(sessionId, dimensionId);
  db.insert(debriefResults).values({ sessionId, dimensionId, comparisonId: null }).run();
  markDebriefStatusDismissed(watchHistoryId, dimensionId);
  autoCompleteIfFinished(sessionId);
}
