/**
 * Composer for the `rotation.*` handler factories.
 *
 * Stitches the candidate-queue / exclusion handlers, the source / settings
 * handlers, and the scheduler / rotation-log handlers into the single map the
 * contract router consumes. Split across factory files to keep each within the
 * per-file line cap.
 */
import { type MediaDb } from '../../db/index.js';
import { makeRotationCandidateHandlers } from './rotation-candidate-handlers.js';
import { makeRotationSchedulerHandlers } from './rotation-scheduler-handlers.js';
import { makeRotationSourceHandlers } from './rotation-source-handlers.js';

export function makeRotationHandlers(db: MediaDb) {
  return {
    ...makeRotationCandidateHandlers(db),
    ...makeRotationSourceHandlers(db),
    ...makeRotationSchedulerHandlers(db),
  };
}
