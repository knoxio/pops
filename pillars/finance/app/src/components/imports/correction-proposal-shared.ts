/**
 * Re-export barrel for correction-proposal types and utilities, sourced from
 * `correction-proposal/types.ts`, `lib/normalization.ts`,
 * `lib/correction-utils.ts`, and `lib/preview-scoping.ts`.
 */

export type {
  AddRuleData,
  AiMessage,
  CorrectionSignal,
  EditRuleData,
  LocalOp,
  OpKind,
  PreviewChangeSetInput,
  PreviewChangeSetOutput,
  PreviewView,
  ProposeChangeSetInput,
  ProposeChangeSetOutput,
  RejectChangeSetInput,
  ReviseChangeSetInput,
  ReviseChangeSetOutput,
  ServerChangeSet,
  ServerChangeSetOp,
  TriggeringTransactionContext,
} from './correction-proposal/types';

export { normalizeForMatch, transactionMatchesSignal } from './lib/normalization';

export { matchTypeLabel, opKindBadgeVariant, opKindLabel, opSummary } from './lib/correction-utils';

export {
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
} from './lib/preview-scoping';
