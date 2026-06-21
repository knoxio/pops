import { useImportStore } from '../../../store/importStore';
import { useBulkAssignment } from '../hooks/useBulkAssignment';
import { useProposalGeneration } from '../hooks/useProposalGeneration';
import { useTransactionEditing } from '../hooks/useTransactionEditing';
import { useTransactionReview } from '../hooks/useTransactionReview';
import { useReviewActions } from './useReviewActions';

export function useReviewStepHooks() {
  const { findSimilar } = useImportStore();
  const review = useTransactionReview();
  const proposal = useProposalGeneration();
  const reviewActions = useReviewActions({
    setLocalTransactions: review.setLocalTransactions,
    findSimilar,
    generateProposal: proposal.generateProposal,
  });
  const editing = useTransactionEditing({
    setLocalTransactions: review.setLocalTransactions,
    generateProposal: proposal.generateProposal,
  });
  const bulk = useBulkAssignment({
    setLocalTransactions: review.setLocalTransactions,
    handleEntitySelect: reviewActions.handleEntitySelect,
    openRuleProposalDialog: proposal.openRuleProposalDialog,
    generateProposal: proposal.generateProposal,
  });
  return { review, proposal, reviewActions, editing, bulk };
}
