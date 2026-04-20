import { and, count, eq } from 'drizzle-orm';

import {
  comparisonDimensions,
  debriefResults,
  debriefSessions,
  debriefStatus,
  watchHistory,
} from '@pops/db-types';

import { getDb, getDrizzle } from '../../../../db.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors.js';

import type {
  ComparisonRow,
  RecordComparisonInput,
  RecordDebriefComparisonInput,
} from '../types.js';

interface ValidationResult {
  watchEntry: typeof watchHistory.$inferSelect;
  sessionStatus: string;
}

function loadAndValidate(input: RecordDebriefComparisonInput): ValidationResult {
  const drizzleDb = getDrizzle();
  const session = drizzleDb
    .select()
    .from(debriefSessions)
    .where(eq(debriefSessions.id, input.sessionId))
    .get();
  if (!session) throw new NotFoundError('Debrief session', String(input.sessionId));
  if (session.status === 'complete') {
    throw new ValidationError('Debrief session is already complete');
  }

  const watchEntry = drizzleDb
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (!watchEntry) throw new NotFoundError('Watch history entry', String(session.watchHistoryId));

  const existingResult = drizzleDb
    .select()
    .from(debriefResults)
    .where(
      and(
        eq(debriefResults.sessionId, input.sessionId),
        eq(debriefResults.dimensionId, input.dimensionId)
      )
    )
    .get();
  if (existingResult) {
    throw new ConflictError('Dimension already recorded for this session');
  }

  return { watchEntry, sessionStatus: session.status };
}

function recordComparisonForDebrief(
  input: RecordDebriefComparisonInput,
  watchEntry: typeof watchHistory.$inferSelect,
  recordFn: (i: RecordComparisonInput) => ComparisonRow
): number | null {
  if (input.winnerId <= 0) return null;
  const compRow = recordFn({
    dimensionId: input.dimensionId,
    mediaAType: watchEntry.mediaType as 'movie' | 'tv_show',
    mediaAId: watchEntry.mediaId,
    mediaBType: input.opponentType,
    mediaBId: input.opponentId,
    winnerType:
      input.winnerId === watchEntry.mediaId
        ? (watchEntry.mediaType as 'movie' | 'tv_show')
        : input.opponentType,
    winnerId: input.winnerId,
    drawTier: input.drawTier ?? null,
    source: 'arena',
  });
  return compRow.id;
}

function markDebriefed(watchEntry: typeof watchHistory.$inferSelect, dimensionId: number): void {
  const drizzleDb = getDrizzle();
  drizzleDb
    .update(debriefStatus)
    .set({ debriefed: 1 })
    .where(
      and(
        eq(debriefStatus.mediaType, watchEntry.mediaType),
        eq(debriefStatus.mediaId, watchEntry.mediaId),
        eq(debriefStatus.dimensionId, dimensionId)
      )
    )
    .run();
}

function activateIfPending(sessionId: number, sessionStatus: string): void {
  if (sessionStatus !== 'pending') return;
  const drizzleDb = getDrizzle();
  drizzleDb
    .update(debriefSessions)
    .set({ status: 'active' })
    .where(eq(debriefSessions.id, sessionId))
    .run();
}

function checkAndCompleteSession(sessionId: number): boolean {
  const drizzleDb = getDrizzle();
  const activeDimCount = drizzleDb
    .select({ cnt: count() })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .get();
  const resultCount = drizzleDb
    .select({ cnt: count() })
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .get();
  const sessionComplete =
    activeDimCount !== undefined &&
    resultCount !== undefined &&
    resultCount.cnt >= activeDimCount.cnt;
  if (sessionComplete) {
    drizzleDb
      .update(debriefSessions)
      .set({ status: 'complete' })
      .where(eq(debriefSessions.id, sessionId))
      .run();
  }
  return sessionComplete;
}

/**
 * Record a debrief comparison for a session + dimension.
 * If winnerId > 0, records a real comparison via the provided recordFn and links it.
 * If winnerId = 0, creates a debrief_result with null comparison_id (skip).
 * Auto-completes the session when all active dimensions have results.
 */
export function recordDebriefComparison(
  input: RecordDebriefComparisonInput,
  recordFn: (input: RecordComparisonInput) => ComparisonRow
): {
  comparisonId: number | null;
  sessionComplete: boolean;
} {
  const { watchEntry, sessionStatus } = loadAndValidate(input);
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  return rawDb.transaction(() => {
    const comparisonId = recordComparisonForDebrief(input, watchEntry, recordFn);
    drizzleDb
      .insert(debriefResults)
      .values({
        sessionId: input.sessionId,
        dimensionId: input.dimensionId,
        comparisonId,
      })
      .run();
    markDebriefed(watchEntry, input.dimensionId);
    activateIfPending(input.sessionId, sessionStatus);
    const sessionComplete = checkAndCompleteSession(input.sessionId);
    return { comparisonId, sessionComplete };
  })();
}
