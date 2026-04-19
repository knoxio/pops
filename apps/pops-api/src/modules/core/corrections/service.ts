/**
 * Transaction corrections service — thin orchestrator, re-exports public API.
 * Manages learned patterns from user edits — Drizzle ORM
 */

export * from './pure-service.js';

export type { RejectedChangeSetFeedbackRecord } from './handlers/ai-inference.js';
export {
  interpretRejectionFeedback,
  persistRejectedChangeSetFeedback,
  reviseChangeSet,
} from './handlers/ai-inference.js';

export { applyChangeSet } from './handlers/apply-corrections.js';

export { proposeChangeSetFromCorrectionSignal } from './handlers/compute-changeset.js';

export {
  findAllMatchingCorrectionFromDB,
  findAllMatchingCorrections,
  findMatchingCorrection,
} from './handlers/pattern-match.js';

export {
  adjustConfidence,
  createOrUpdateCorrection,
  deleteCorrection,
  getCorrection,
  incrementCorrectionUsage,
  listCorrections,
  updateCorrection,
} from './handlers/query-helpers.js';
