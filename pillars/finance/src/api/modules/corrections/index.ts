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

// AI cluster (C1-b)
export { analyzeCorrection, generateRules } from './ai-analyze.js';
export { proposeChangeSetFromCorrectionSignal, reviseChangeSet } from './ai-propose.js';
export {
  persistRejectedChangeSetFeedback,
  loadLatestRejectedFeedback,
  feedbackKey,
} from './ai-feedback.js';
export {
  __setClaudeCompleterForTests,
  __setFeedbackStoreForTests,
  type ClaudeCompleter,
  type FeedbackStore,
} from './ai-runtime.js';
export {
  type CorrectionAnalysis,
  type ProposedRule,
  type ChangeSetProposal,
  type CorrectionSignal,
} from './ai-types.js';
