/**
 * Re-export hub for correction-proposal types and utilities.
 *
 * This file used to contain all types, helpers, and constants inline.
 * They have been extracted into `correction-proposal/types.ts`, `lib/normalization.ts`,
 * `lib/correction-utils.ts`, and `lib/preview-scoping.ts` (tb-365).
 *
 * This file remains as a re-export barrel so existing consumers are unaffected.
 */

// Types
export type {
  AddRuleData,
  AiMessage,
  CorrectionSignal,
  EditRuleData,
  LocalOp,
  OpKind,
  PreviewChangeSetOutput,
  PreviewView,
  ServerChangeSet,
  ServerChangeSetOp,
  TriggeringTransactionContext,
} from './correction-proposal/types';

// Normalization
export { normalizeForMatch, transactionMatchesSignal } from './lib/normalization';

// Display helpers
export { matchTypeLabel, opKindBadgeVariant, opKindLabel, opSummary } from './lib/correction-utils';

// Preview scoping
export {
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
} from './lib/preview-scoping';
