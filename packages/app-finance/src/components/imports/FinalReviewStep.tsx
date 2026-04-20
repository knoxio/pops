import { AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@pops/ui';

import { CommitResultPanel } from './final-review/CommitResultPanel';
import {
  ClassificationRulesSection,
  EntitiesSection,
  TagAssignmentsSection,
  TagRulesSection,
  TransactionsSection,
} from './final-review/Sections';
import { useFinalReview } from './final-review/useFinalReview';

function CommitErrorPanel({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <div className="text-sm text-destructive">
        <p className="font-medium">Commit failed</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    </div>
  );
}

function ActionFooter({
  committed,
  isCommitting,
  onBack,
  onCommit,
  onContinue,
}: {
  committed: boolean;
  isCommitting: boolean;
  onBack: () => void;
  onCommit: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex justify-between pt-4">
      {!committed && (
        <Button variant="outline" onClick={onBack} disabled={isCommitting}>
          Back
        </Button>
      )}
      {committed ? (
        <Button onClick={onContinue} className="ml-auto">
          Continue
        </Button>
      ) : (
        <Button onClick={onCommit} disabled={isCommitting}>
          {isCommitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isCommitting ? 'Committing...' : 'Approve & Commit All'}
        </Button>
      )}
    </div>
  );
}

function ReviewBody(props: ReturnType<typeof useFinalReview>) {
  const {
    pendingEntities,
    pendingChangeSets,
    pendingTagRuleChangeSets,
    totalOps,
    totalTagRuleOps,
    txnBreakdown,
    tagAssignmentCount,
    taggedTxnCount,
  } = props;
  const isEmpty =
    pendingEntities.length === 0 &&
    totalOps === 0 &&
    totalTagRuleOps === 0 &&
    txnBreakdown.total === 0 &&
    tagAssignmentCount === 0;
  return (
    <div className="space-y-4">
      <EntitiesSection entities={pendingEntities} />
      <ClassificationRulesSection pendingChangeSets={pendingChangeSets} totalOps={totalOps} />
      <TagRulesSection
        pendingTagRuleChangeSets={pendingTagRuleChangeSets}
        totalTagRuleOps={totalTagRuleOps}
      />
      <TransactionsSection txnBreakdown={txnBreakdown} />
      <TagAssignmentsSection
        tagAssignmentCount={tagAssignmentCount}
        taggedTxnCount={taggedTxnCount}
      />
      {isEmpty && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No pending changes to review.
        </p>
      )}
    </div>
  );
}

export function FinalReviewStep() {
  const state = useFinalReview();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Final Review</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Review all pending changes before committing. Navigate back to make edits.
        </p>
      </div>
      <ReviewBody {...state} />
      {state.commitError && <CommitErrorPanel error={state.commitError} />}
      {state.committed && state.commitResult && (
        <CommitResultPanel commitResult={state.commitResult} />
      )}
      <ActionFooter
        committed={state.committed}
        isCommitting={state.isCommitting}
        onBack={state.prevStep}
        onCommit={state.handleCommit}
        onContinue={state.nextStep}
      />
    </div>
  );
}
