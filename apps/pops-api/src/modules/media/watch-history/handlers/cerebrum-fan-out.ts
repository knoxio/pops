/**
 * Cross-pillar debrief fan-out helper. Lifted out of `log-watch-event.ts`
 * to keep that file under the max-lines cap.
 *
 * Wraps the cerebrum SDK boundary call (`cerebrum.debrief.logWatchCompletion`)
 * in a try/catch — the writer side stays idempotent on
 * `(watchHistoryId, mediaType, mediaId)` so swallowing transient failures
 * is safe: the user's watch row is already committed by the time we get
 * here, and a follow-up reconciler can replay any orphaned rows.
 */
import { logWatchCompletion } from '../../../cerebrum/debrief/router.js';

export interface DebriefFanOutInput {
  mediaType: 'movie' | 'episode';
  mediaId: number;
  watchHistoryId: number;
}

export function fanOutDebriefCompletion(input: DebriefFanOutInput): void {
  try {
    logWatchCompletion(input);
  } catch (err) {
    console.error('[logWatch] cerebrum debrief fan-out failed (non-fatal):', err);
  }
}
