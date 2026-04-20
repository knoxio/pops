import { useCallback } from 'react';

import { useImportStore } from '../../store/importStore';
import { buildConfirmedTransactions } from './review/buildConfirmed';
import { ReviewFooter, ReviewHeader } from './review/ReviewChrome';
import { ReviewDialogs } from './review/ReviewDialogs';
import { ReviewTabs } from './review/ReviewTabs';
import { ReviewWarnings } from './review/ReviewWarnings';
import { useReviewStepHooks } from './review/useReviewStepHooks';

/**
 * Step 4: Review transactions and resolve uncertain/failed matches
 */
export function ReviewStep() {
  const { processedTransactions, processSessionId, setConfirmedTransactions, nextStep, goToStep } =
    useImportStore();
  const { review, proposal, reviewActions, editing, bulk } = useReviewStepHooks();

  const handleContinueToTagReview = useCallback(() => {
    setConfirmedTransactions(buildConfirmedTransactions(review.localTransactions.matched));
    nextStep();
  }, [review.localTransactions.matched, setConfirmedTransactions, nextStep]);

  const allPreviewTransactions = [
    ...review.localTransactions.matched,
    ...review.localTransactions.uncertain,
    ...review.localTransactions.failed,
    ...review.localTransactions.skipped,
  ].map((t) => ({ checksum: t.checksum, description: t.description }));

  return (
    <div className="space-y-6">
      <ReviewDialogs
        proposal={proposal}
        bulk={bulk}
        review={review}
        processSessionId={processSessionId ?? ''}
        allPreviewTransactions={allPreviewTransactions}
      />
      <ReviewHeader
        unresolvedCount={review.unresolvedCount}
        browseOpen={proposal.browseOpen}
        setBrowseOpen={proposal.setBrowseOpen}
      />
      <ReviewWarnings warnings={processedTransactions.warnings} />
      <ReviewTabs
        activeTab={review.activeTab}
        onTabChange={review.handleTabChange}
        localTransactions={review.localTransactions}
        uncertainGroups={review.uncertainGroups}
        failedGroups={review.failedGroups}
        viewMode={review.viewMode}
        setViewMode={review.setViewMode}
        editingTransaction={editing.editingTransaction}
        handleEdit={editing.handleEdit}
        handleSaveEdit={editing.handleSaveEdit}
        handleCancelEdit={editing.handleCancelEdit}
        handleEntitySelect={reviewActions.handleEntitySelect}
        handleBulkEntitySelect={reviewActions.handleBulkEntitySelect}
        handleCreateEntity={bulk.handleCreateEntity}
        handleAcceptAiSuggestion={bulk.handleAcceptAiSuggestion}
        handleAcceptAll={bulk.handleAcceptAll}
        handleCreateAndAssignAll={bulk.handleCreateAndAssignAll}
        entities={bulk.entities}
      />
      <ReviewFooter
        unresolvedCount={review.unresolvedCount}
        matchedCount={review.localTransactions.matched.length}
        onBack={() => goToStep(2)}
        onContinue={handleContinueToTagReview}
      />
    </div>
  );
}
