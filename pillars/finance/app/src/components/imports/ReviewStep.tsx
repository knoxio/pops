import { useImportStore } from '../../store/importStore';
import { LiveArrivalsBanner } from './live/LiveArrivalsBanner';
import { DroppedRowsNotice } from './review/DroppedRowsNotice';
import { EntityLookupUnavailableNotice } from './review/EntityLookupUnavailableNotice';
import { ReviewFooter, ReviewHeader } from './review/ReviewChrome';
import { ReviewDialogs } from './review/ReviewDialogs';
import { ReviewTabs } from './review/ReviewTabs';
import { ReviewWarnings } from './review/ReviewWarnings';
import { useReviewStepHooks } from './review/useReviewStepHooks';

import type { LocalTxState } from './hooks/local-tx-reconcile';

/**
 * Flatten every bucket to the `{ checksum, description, accountId }` list the
 * dialogs preview against.
 *
 * `accountId` is carried per row rather than dropped (POPS-2975): a row whose
 * account-step (POPS-2840) resolved one narrows the preview to the rules that
 * account can actually see, exactly like the live matcher does at commit
 * time. A row with no resolved account (still possible for a caller
 * predating POPS-2852) omits it, which the pillar reads as "no account in
 * hand" and previews against every rule — the same conservative,
 * over-report-rather-than-under-report behaviour as before this fix. Rows
 * are never forced to agree on one account before narrowing: each is scoped
 * independently, so one row's known account can never hide or misreport
 * another row's.
 */
function toPreviewList(local: LocalTxState) {
  return [...local.matched, ...local.uncertain, ...local.failed, ...local.skipped].map((t) => ({
    checksum: t.checksum,
    description: t.description,
    ...(t.accountId !== undefined && { accountId: t.accountId }),
  }));
}

/**
 * Step 4: Review transactions and resolve uncertain/failed matches
 */
export function ReviewStep() {
  const { processedTransactions, processSessionId, goToStep } = useImportStore();
  const { review, proposal, reviewActions, editing, bulk, commit, isRecomputingTags } =
    useReviewStepHooks();

  const allPreviewTransactions = toPreviewList(review.localTransactions);

  return (
    <div className="space-y-6">
      <ReviewDialogs
        proposal={proposal}
        bulk={bulk}
        review={review}
        processSessionId={processSessionId ?? ''}
        allPreviewTransactions={allPreviewTransactions}
      />
      <LiveArrivalsBanner />
      <ReviewHeader
        isReevaluating={review.isReevaluating}
        unresolvedCount={review.unresolvedCount}
        browseOpen={proposal.browseOpen}
        setBrowseOpen={proposal.setBrowseOpen}
      />
      <ReviewWarnings warnings={processedTransactions.warnings} />
      {bulk.entityVerification === 'unavailable' && (
        <EntityLookupUnavailableNotice onRetry={() => void bulk.retryEntityLookup()} />
      )}
      <DroppedRowsNotice dropped={commit.dropped} />
      <ReviewTabs
        activeTab={review.activeTab}
        onTabChange={review.handleTabChange}
        localTransactions={review.localTransactions}
        matchedGroups={review.matchedGroups}
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
        handleCreateEntityWithName={bulk.handleCreateEntityWithName}
        handleAcceptAiSuggestion={bulk.handleAcceptAiSuggestion}
        handleAcceptAll={bulk.handleAcceptAll}
        handleCreateAndAssignAll={bulk.handleCreateAndAssignAll}
        entities={bulk.entities}
        entityVerification={bulk.entityVerification}
      />
      <ReviewFooter
        unresolvedCount={review.unresolvedCount}
        committedCount={commit.confirmed.length}
        onBack={() => goToStep(2)}
        onContinue={commit.continueToTagReview}
        isRecomputingTags={isRecomputingTags}
      />
    </div>
  );
}
