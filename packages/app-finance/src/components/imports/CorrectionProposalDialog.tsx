import {
  type CorrectionSignal,
  type ServerChangeSet,
  type TriggeringTransactionContext,
} from './correction-proposal-shared';
import { CorrectionProposalWorkflow } from './correction-proposal/CorrectionProposalWorkflow';
import { CorrectionRuleManagerDialog } from './correction-proposal/CorrectionRuleManagerDialog';

// Re-export shared symbols so existing consumers don't break
export type {
  AddRuleData,
  CorrectionSignal,
  EditRuleData,
  LocalOp,
  OpKind,
  PreviewChangeSetOutput,
  TriggeringTransactionContext,
} from './correction-proposal-shared';
export {
  matchTypeLabel,
  normalizeForMatch,
  opKindBadgeVariant,
  opKindLabel,
  opSummary,
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
  transactionMatchesSignal,
} from './correction-proposal-shared';

// Re-export hook helpers for tests
export { serverOpToLocalOp } from './hooks/useLocalOps';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CorrectionProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  signal: CorrectionSignal | null;
  triggeringTransaction: TriggeringTransactionContext | null;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  minConfidence?: number;
  onApproved?: (changeSet: ServerChangeSet) => void;
  mode?: 'proposal' | 'browse';
  onBrowseClose?: (hadChanges: boolean) => void;
}

export function CorrectionProposalDialog(props: CorrectionProposalDialogProps) {
  const minConfidence = props.minConfidence ?? 0.7;
  if (props.mode === 'browse') {
    return (
      <CorrectionRuleManagerDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        onBrowseClose={props.onBrowseClose}
        minConfidence={minConfidence}
      />
    );
  }

  return (
    <CorrectionProposalWorkflow
      open={props.open}
      onOpenChange={props.onOpenChange}
      sessionId={props.sessionId}
      signal={props.signal}
      triggeringTransaction={props.triggeringTransaction}
      previewTransactions={props.previewTransactions}
      minConfidence={minConfidence}
      onApproved={props.onApproved}
    />
  );
}
