import { Button } from '@pops/ui';

import { EntityGroup } from './tag-review/EntityGroup';
import { useTagReviewState } from './tag-review/useTagReviewState';
import { TagRuleProposalDialog } from './TagRuleProposalDialog';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Step 5: Tag Review — review and adjust tags before Final Review (PRD-030 / PRD-031).
 *
 * Confirmed transactions arrive with tags pre-populated from AI/rule/entity
 * suggestions. This step lets the user accept, modify, or clear tags. **No DB
 * writes** — Continue syncs tags into the store and advances to Step 6; the
 * single write path is `commitImport` on Final Review.
 *
 * Features:
 * - All groups expanded by default (including those with no suggestions)
 * - Group-level bulk tag application (merge semantics — never replaces individual edits)
 * - Per-transaction tag editing via TagEditor
 * - Source badges on suggested tags: 🤖 AI, 📋 Rule, 🏪 Entity
 * - Rule pattern shown via tooltip on badge hover
 * - "Save tag rule…" button per group — opens TagRuleProposalDialog (PRD-029 US-02/US-03)
 */
export function TagReviewStep() {
  const state = useTagReviewState();
  const { confirmedCount, handleAcceptAll, prevStep, handleContinue } = state;
  return (
    <div className="space-y-6">
      <TagReviewHeader />
      {confirmedCount > 0 && (
        <Button variant="outline" size="sm" onClick={handleAcceptAll}>
          Accept All Suggestions
        </Button>
      )}
      <EntityGroups state={state} />
      <TagReviewFooter
        confirmedCount={confirmedCount}
        onBack={prevStep}
        onContinue={handleContinue}
      />
      <TagRuleProposalDialog
        open={state.tagRuleDialog !== null}
        onOpenChange={state.setTagRuleDialogOpen}
        signal={state.tagRuleDialog?.signal ?? null}
        previewTransactions={state.previewTransactions}
        onApplied={state.handleTagRuleApplied}
      />
    </div>
  );
}

function EntityGroups({ state }: { state: ReturnType<typeof useTagReviewState> }) {
  return (
    <div className="space-y-4">
      {state.groups.map((group) => (
        <EntityGroup
          key={group.entityName}
          group={group}
          localTags={state.localTags}
          suggestedTagMeta={state.suggestedTagMeta}
          availableTags={state.availableTags}
          onUpdateTag={state.updateTag}
          onApplyGroupTags={state.handleApplyGroupTags}
          onSaveTagRule={state.handleOpenTagRuleDialog}
          onSaveTagRuleForTransaction={state.handleOpenTagRuleDialogForTransaction}
        />
      ))}
      {state.confirmedCount === 0 && (
        <p className="text-center py-8 text-muted-foreground text-sm">No transactions to import.</p>
      )}
    </div>
  );
}

function TagReviewHeader() {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-2">Tag Review</h2>
      <p className="text-sm text-muted-foreground">
        Review and adjust tags. Nothing is written to the database until you approve on Final
        Review. Tags are pre-filled from AI suggestions, learned rules, and entity defaults.
      </p>
    </div>
  );
}

interface TagReviewFooterProps {
  confirmedCount: number;
  onBack: () => void;
  onContinue: () => void;
}

function TagReviewFooter({ confirmedCount, onBack, onContinue }: TagReviewFooterProps) {
  const label =
    confirmedCount === 0
      ? 'Continue to final review'
      : `Continue to final review (${confirmedCount} transaction${confirmedCount !== 1 ? 's' : ''})`;
  return (
    <div className="flex justify-between items-center pt-2">
      <Button variant="outline" onClick={onBack}>
        Back
      </Button>
      <Button
        onClick={onContinue}
        disabled={confirmedCount === 0}
        aria-label="Continue to final review"
      >
        {label}
      </Button>
    </div>
  );
}
