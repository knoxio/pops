import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { useImportStore } from '../../../store/importStore';
import { CorrectionProposalDialog } from '../CorrectionProposalDialog';
import { EntityCreateDialog } from '../EntityCreateDialog';

import type { useBulkAssignment } from '../hooks/useBulkAssignment';
import type { useProposalGeneration } from '../hooks/useProposalGeneration';
import type { useTransactionReview } from '../hooks/useTransactionReview';

interface BrowseDialogProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  sessionId: string;
  previewTransactions: Array<{ checksum: string; description: string }>;
  setLocalTransactions: ReturnType<typeof useTransactionReview>['setLocalTransactions'];
}

function BrowseDialog({
  open,
  setOpen,
  sessionId,
  previewTransactions,
  setLocalTransactions,
}: BrowseDialogProps) {
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const reevaluateMutation = trpc.finance.imports.reevaluateWithPendingRules.useMutation();
  const onClose = (hadChanges: boolean) => {
    if (!hadChanges || !sessionId || pendingChangeSets.length === 0) return;
    reevaluateMutation.mutate(
      {
        sessionId,
        minConfidence: 0.7,
        pendingChangeSets: pendingChangeSets.map((pcs) => ({ changeSet: pcs.changeSet })),
      },
      {
        onSuccess: ({ result, affectedCount }) => {
          setLocalTransactions(result);
          toast.success(
            `Rules applied — ${affectedCount} transaction${affectedCount === 1 ? '' : 's'} re-evaluated`
          );
        },
        onError: () => toast.error('Failed to re-evaluate transactions against updated rules'),
      }
    );
  };
  return (
    <CorrectionProposalDialog
      open={open}
      onOpenChange={setOpen}
      mode="browse"
      sessionId={sessionId}
      signal={null}
      triggeringTransaction={null}
      previewTransactions={previewTransactions}
      onBrowseClose={onClose}
    />
  );
}

interface DialogsProps {
  proposal: ReturnType<typeof useProposalGeneration>;
  bulk: ReturnType<typeof useBulkAssignment>;
  review: ReturnType<typeof useTransactionReview>;
  processSessionId: string;
  allPreviewTransactions: Array<{ checksum: string; description: string }>;
}

export function ReviewDialogs({
  proposal,
  bulk,
  review,
  processSessionId,
  allPreviewTransactions,
}: DialogsProps) {
  return (
    <>
      <CorrectionProposalDialog
        open={proposal.proposalOpen}
        onOpenChange={proposal.setProposalOpen}
        sessionId={processSessionId}
        signal={proposal.proposalSignal}
        triggeringTransaction={proposal.proposalTriggeringTransaction}
        previewTransactions={allPreviewTransactions}
        onApproved={() => toast.success('Rules saved locally')}
      />
      <BrowseDialog
        open={proposal.browseOpen}
        setOpen={proposal.setBrowseOpen}
        sessionId={processSessionId}
        previewTransactions={allPreviewTransactions}
        setLocalTransactions={review.setLocalTransactions}
      />
      <EntityCreateDialog
        open={bulk.showCreateDialog}
        onOpenChange={(open) => {
          bulk.setShowCreateDialog(open);
          if (!open) {
            bulk.setPendingBulkTransactions(null);
            bulk.setSelectedTransaction(null);
          }
        }}
        onEntityCreated={bulk.handleEntityCreated}
        suggestedName={bulk.selectedTransaction?.entity?.entityName}
        dbEntities={bulk.dbEntitiesData?.data}
      />
    </>
  );
}
