/**
 * PRD-135 — decision pane.
 *
 * Top-to-bottom: quality band card, auto-create banner, proposed-slug
 * list (with cursor-move callback), decision controls (Approve / Reject
 * or Undo for archived). Partial-draft sources surface a Re-run pipeline
 * button alongside Approve / Reject; `auth-dead` disables it with a
 * tooltip linking to the IG cookie runbook.
 */
import { useMutation } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@pops/ui';

import { unwrap } from '../../../food-api-helpers.js';
import { inboxUnreject, ingestRetry } from '../../../food-api/index.js';
import { ApproveDialog } from './ApproveDialog.js';
import { AutoCreateBanner } from './AutoCreateBanner.js';
import { ProposedSlugsList } from './ProposedSlugsList.js';
import { QualityBandCard } from './QualityBandCard.js';
import { RejectDialog } from './RejectDialog.js';

import type {
  InspectorDraftView,
  InspectorProposedSlugRow,
  InspectorReviewView,
} from './inspector-wire-types.js';

interface Props {
  review: InspectorReviewView;
  onMutated: () => void;
  onPickSlug: (row: InspectorProposedSlugRow) => void;
}

export function DecisionPane({ review, onMutated, onPickSlug }: Props): ReactElement {
  const { source, draft } = review;
  if (draft === null) return <DecisionEmpty />;
  return (
    <section className="space-y-4" data-testid="inspector-decision-pane">
      <QualityBandCard quality={draft.quality} />
      <AutoCreateBanner creations={draft.creations} />
      <ProposedSlugsList proposedSlugs={draft.proposedSlugs} onPickSlug={onPickSlug} />
      {draft.status === 'archived' ? (
        <ArchivedControls draft={draft} onMutated={onMutated} />
      ) : (
        <PendingControls draft={draft} source={review.source} onMutated={onMutated} />
      )}
      {source.state === 'partial' && (
        <RerunPipelineButton
          sourceId={source.id}
          partialReason={source.partialReason ?? null}
          onRequeued={onMutated}
        />
      )}
    </section>
  );
}

function DecisionEmpty(): ReactElement {
  const { t } = useTranslation('food');
  return (
    <p className="text-sm text-muted-foreground" data-testid="inspector-decision-empty">
      {t('inbox.inspector.decision.noDraft')}
    </p>
  );
}

interface PendingControlsProps {
  draft: InspectorDraftView;
  source: InspectorReviewView['source'];
  onMutated: () => void;
}

function PendingControls({ draft, source, onMutated }: PendingControlsProps): ReactElement {
  const { t } = useTranslation('food');
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const approveBlocked =
    draft.quality.band === 'blocked' ||
    draft.compileStatus !== 'compiled' ||
    source.state === 'processing';
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={approveBlocked}
          onClick={() => setApproveOpen(true)}
          title={approveBlocked ? t('inbox.inspector.decision.approve.disabledTooltip') : undefined}
          data-testid="inspector-approve-button"
        >
          {t('inbox.inspector.decision.approve.button')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRejectOpen(true)}
          data-testid="inspector-reject-button"
        >
          {t('inbox.inspector.decision.reject.button')}
        </Button>
      </div>
      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        versionId={draft.versionId}
        recipeSlug={draft.recipeSlug}
        onApproved={onMutated}
      />
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        versionId={draft.versionId}
        onRejected={onMutated}
      />
    </div>
  );
}

interface ArchivedControlsProps {
  draft: InspectorDraftView;
  onMutated: () => void;
}

function ArchivedControls({ draft, onMutated }: ArchivedControlsProps): ReactElement {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const unrejectMutation = useMutation({
    mutationFn: async (input: { versionId: number }) =>
      unwrap(await inboxUnreject({ body: input })),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(t('inbox.inspector.decision.undo.success'));
        onMutated();
        void navigate('/food/inbox?tab=rejected');
      } else {
        toast.error(t(`inbox.inspector.decision.undo.error.${res.reason}` as const));
      }
    },
    onError: (err: Error) =>
      toast.error(t('inbox.inspector.decision.undo.error.generic', { message: err.message })),
  });
  return (
    <div className="space-y-3" data-testid="inspector-archived-controls">
      {draft.rejection !== null && (
        <article
          className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm"
          data-testid="inspector-rejection-details"
        >
          <p className="font-medium">{t(`inbox.rejected.reason.${draft.rejection.reason}`)}</p>
          {draft.rejection.note !== null && (
            <p className="whitespace-pre-wrap text-muted-foreground">{draft.rejection.note}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t('inbox.inspector.decision.undo.rejectedAt', { when: draft.rejection.rejectedAt })}
          </p>
        </article>
      )}
      <Button
        type="button"
        disabled={unrejectMutation.isPending}
        onClick={() => unrejectMutation.mutate({ versionId: draft.versionId })}
        data-testid="inspector-undo-button"
      >
        {unrejectMutation.isPending
          ? t('inbox.inspector.decision.undo.submitting')
          : t('inbox.inspector.decision.undo.button')}
      </Button>
    </div>
  );
}

function RerunPipelineButton({
  sourceId,
  partialReason,
  onRequeued,
}: {
  sourceId: number;
  partialReason: string | null;
  onRequeued: () => void;
}): ReactElement {
  const { t } = useTranslation('food');
  // PRD-135 §"Partial-draft retry variant" — `auth-dead` is disabled until
  // the operator refreshes cookies out-of-band (see the IG cookie runbook).
  const isDisabled = partialReason === 'auth-dead';
  // `partial` is a terminal state, so the inspector's poll stops; without an
  // explicit invalidate after re-queue the UI sticks on the old partial draft
  // until the user reloads. Bumping `onRequeued` invalidates the query
  // (Copilot R1).
  const mutation = useMutation({
    mutationFn: async (input: { sourceId: number }) => unwrap(await ingestRetry({ body: input })),
    onSuccess: () => {
      toast.success(t('inbox.inspector.decision.rerun.success'));
      onRequeued();
    },
    onError: (err: Error) =>
      toast.error(t('inbox.inspector.decision.rerun.error', { message: err.message })),
  });
  return (
    <Button
      type="button"
      variant="outline"
      disabled={isDisabled || mutation.isPending}
      onClick={() => mutation.mutate({ sourceId })}
      title={isDisabled ? t('inbox.inspector.decision.rerun.authDeadTooltip') : undefined}
      data-testid="inspector-rerun-button"
    >
      {t('inbox.inspector.decision.rerun.button')}
    </Button>
  );
}
