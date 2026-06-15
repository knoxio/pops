/**
 * Cross-pillar debrief fan-out helper. Lifted out of `log-watch-event.ts`
 * to keep that file under the max-lines cap.
 *
 * Wraps the cerebrum SDK boundary call (`cerebrum.debrief.logWatchCompletion`)
 * in a try/catch — the writer side stays idempotent on
 * `(watchHistoryId, mediaType, mediaId)` so swallowing transient failures
 * is safe: the user's watch row is already committed by the time we get
 * here, and a follow-up reconciler can replay any orphaned rows.
 *
 * PRD-248 US-05c (Option D mixed-tx flip): the call now goes through
 * `pillar('cerebrum').debrief.logWatchCompletion` instead of the
 * in-monolith `@pops/cerebrum-db`-backed router import. See
 * [`docs/themes/13-pillar-finale/notes/media-watch-history-mixed-tx-design.md`](../../../../../../../docs/themes/13-pillar-finale/notes/media-watch-history-mixed-tx-design.md)
 * §5 for the contract.
 *
 * The exported helper is fire-and-forget (returns `void`) so the caller's
 * synchronous signature (`logWatch`, `batchLogWatch`, plex sync helpers)
 * stays unchanged — the cascade ban in PRD-248 US-05c keeps the plex /
 * arr / rotation callers untouched. Failures are absorbed inside the
 * helper; the user's watch row is the source of truth.
 */
import { pillar, PillarCallError } from '@pops/pillar-sdk/server';

import { logger } from '../../../../lib/logger.js';

export interface DebriefFanOutInput {
  mediaType: 'movie' | 'episode';
  mediaId: number;
  watchHistoryId: number;
}

interface LogWatchCompletionResultShape {
  sessionId: number;
  dimensionsQueued: number;
}

type CerebrumDebriefShape = {
  debrief: {
    logWatchCompletion: (input: DebriefFanOutInput) => LogWatchCompletionResultShape;
  };
};

function logFanOutFailure(err: unknown, watchHistoryId: number): void {
  if (err instanceof PillarCallError) {
    logger.warn(
      { err, watchHistoryId },
      '[logWatch] cerebrum debrief fan-out failed (non-fatal) — will self-heal on next watch or reconciler'
    );
    return;
  }
  logger.error(
    { err, watchHistoryId },
    '[logWatch] cerebrum debrief fan-out failed unexpectedly (non-fatal)'
  );
}

export function fanOutDebriefCompletion(input: DebriefFanOutInput): void {
  void runFanOut(input);
}

async function runFanOut(input: DebriefFanOutInput): Promise<void> {
  try {
    await pillar<CerebrumDebriefShape>('cerebrum').debrief.logWatchCompletion.orThrow(input);
  } catch (err) {
    logFanOutFailure(err, input.watchHistoryId);
  }
}
