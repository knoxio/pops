/**
 * Composer for the `rotation.*` handler factories.
 *
 * Stitches the candidate-queue / exclusion handlers and the source / settings
 * handlers into the single map the contract router consumes. Split across two
 * factory files to keep each within the per-file line cap.
 *
 * NOTE: this is the rotation DATA PLANE only. The scheduler / rotation-cycle /
 * leaving-lifecycle / disk-space / rotation-log read procedures are slice 11b
 * and are intentionally not wired here.
 */
import { type MediaDb } from '../../db/index.js';
import { makeRotationCandidateHandlers } from './rotation-candidate-handlers.js';
import { makeRotationSourceHandlers } from './rotation-source-handlers.js';

export function makeRotationHandlers(db: MediaDb) {
  return {
    ...makeRotationCandidateHandlers(db),
    ...makeRotationSourceHandlers(db),
  };
}
