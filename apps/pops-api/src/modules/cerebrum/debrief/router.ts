/**
 * Cerebrum-side debrief writer surface.
 *
 * Option D step 2 of the MEDIA pillar exit (PR #3111). The MEDIA pillar
 * still owns the watch-history transaction (`logWatch`), but cerebrum
 * now owns the *post-watch* fan-out: creating the debrief session row
 * and queueing one debrief_status entry per active dimension. Step 1
 * (#3119) denormalised `(media_type, media_id)` onto `debrief_sessions`
 * so this writer can populate the columns directly; step 3 physically
 * moves the debrief tables into `cerebrum.db` and replaces the media
 * side's in-tx `getDebriefByMedia` call with a `logWatchCompletion`
 * invocation, retiring the cross-pillar transaction.
 *
 * Idempotency: both child calls are individually idempotent —
 * `createDebriefSession` deletes any prior pending/active row for the
 * same media before inserting, and `queueDebriefStatus` upserts on
 * `(media_type, media_id, dimension_id)` and resets `debriefed` /
 * `dismissed` to 0. Calling `logWatchCompletion` twice for the same
 * `(watchHistoryId, mediaType, mediaId)` therefore converges on a
 * single pending debrief row with reset status counters.
 *
 * The wrapping `getCerebrumDrizzle().transaction(...)` is the
 * forward-compatible call shape: in env-scope test fixtures it collapses
 * onto the shared pops.db connection so the writes are genuinely atomic
 * today, and in production it becomes a real cross-table boundary once
 * step 3 lands and `debrief_sessions` / `debrief_status` are physically
 * owned by `cerebrum.db`. Until then the inner services continue to
 * resolve `getDrizzle()` (pops.db) directly — the transaction is a
 * forward-compatible scaffold, not a runtime atomicity guarantee on
 * production yet.
 */
import { z } from 'zod';

import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { createDebriefSession, queueDebriefStatus } from '../../media/debrief/service.js';

const LogWatchCompletionSchema = z.object({
  mediaType: z.enum(['movie', 'episode']),
  mediaId: z.number().int().positive(),
  watchHistoryId: z.number().int().positive(),
});

export type LogWatchCompletionInput = z.infer<typeof LogWatchCompletionSchema>;

export interface LogWatchCompletionResult {
  sessionId: number;
  dimensionsQueued: number;
}

export function logWatchCompletion(input: LogWatchCompletionInput): LogWatchCompletionResult {
  const db = getCerebrumDrizzle();
  return db.transaction(() => {
    const sessionId = createDebriefSession(input.watchHistoryId);
    const dimensionsQueued = queueDebriefStatus(input.mediaType, input.mediaId);
    return { sessionId, dimensionsQueued };
  });
}

export const debriefRouter = router({
  /**
   * Post-watch debrief fan-out. Called by the MEDIA pillar after a
   * completed watch lands; creates the debrief session and queues
   * debrief_status rows. Safe to call more than once for the same
   * `(watchHistoryId, mediaType, mediaId)` — see file header.
   */
  logWatchCompletion: protectedProcedure
    .input(LogWatchCompletionSchema)
    .mutation(({ input }) => logWatchCompletion(input)),
});
