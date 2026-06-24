export * from './types/index.js';
export * from './schemas/index.js';
export * from './errors.js';
export type { FinanceRouter } from './router.js';
export type { FinanceContract } from './manifest.js';

// Browser-consumable corrections surface, shared with the app so the
// optimistic import-merge has a single implementation.
export {
  applyChangeSetToRules,
  correctionToRow,
  toCorrection,
  normalizeDescription,
  HIGH_CONFIDENCE_THRESHOLD,
  type Correction,
  type CorrectionRow,
} from './corrections-pure.js';
export { type ChangeSet, type ChangeSetOp } from './rest-corrections-schemas.js';
export {
  type ParsedTransaction,
  type ProcessedTransaction,
  type ConfirmedTransaction,
  type ImportWarning,
  type ProcessImportOutput,
  type CommitResult,
  type SuggestedTag,
  type MatchedRule,
} from './rest-imports-schemas.js';
export { type TagRuleChangeSet, type TagRuleImpactItem } from './rest-tag-rules.js';
