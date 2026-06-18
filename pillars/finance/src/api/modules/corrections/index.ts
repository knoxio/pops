/**
 * Correction-rule domain logic consumed by the imports pipeline.
 *
 * No REST routes of its own (see `contract/rest-corrections.ts` for the shared
 * schemas). Exposes the DB-injected `applyChangeSet` plus the pure in-memory
 * matchers and classification helpers.
 */
export { applyChangeSet } from './service.js';
export {
  applyChangeSetToRules,
  findAllMatchingCorrectionFromRules,
  findMatchingCorrectionFromRules,
  ruleMatchesDescription,
} from './pure.js';
export {
  previewChangeSetImpact,
  summarizeMatch,
  type ChangeSetPreviewDiff,
  type ChangeSetPreviewSummary,
  type CorrectionMatchSummary,
  type PreviewTransaction,
} from './preview-impact.js';
export {
  classifyCorrectionMatch,
  parseCorrectionTags,
  HIGH_CONFIDENCE_THRESHOLD,
  type CorrectionMatchResult,
  type CorrectionMatchStatus,
  type CorrectionRow,
} from './types.js';
