import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import { trpc } from '@pops/api-client';
import { Button, WorkflowDialog } from '@pops/ui';

import { useImportStore } from '../../../store/importStore';
import {
  AiHelperPanel,
  ContextPanel,
  DetailPanel,
  ImpactPanel,
  OpsListPanel,
  type PreviewView,
  RejectPanel,
} from '../CorrectionProposalDialogPanels';
import { useApplyRejectMutations } from '../hooks/useApplyRejectMutations';
import { useLocalOps } from '../hooks/useLocalOps';
import { usePreviewEffects } from '../hooks/usePreviewEffects';

import type {
  CorrectionSignal,
  ServerChangeSet,
  TriggeringTransactionContext,
} from '../correction-proposal-shared';

export interface CorrectionProposalWorkflowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  signal: CorrectionSignal | null;
  triggeringTransaction: TriggeringTransactionContext | null;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  minConfidence: number;
  onApproved?: (changeSet: ServerChangeSet) => void;
}

function previewLabel(view: PreviewView, hasSelectedOp: boolean): string {
  if (view === 'combined') return 'Combined effect of entire ChangeSet';
  if (hasSelectedOp) return 'Effect of selected operation';
  return 'No operation selected';
}

function renderProposalBodyState(
  signal: CorrectionSignal | null,
  proposeQuery: { isError: boolean; isLoading: boolean; error?: { message: string } | null },
  hasOps: boolean
): ReactNode {
  if (!signal) {
    return (
      <div className="px-6 pb-6 text-sm text-muted-foreground">No proposal signal provided.</div>
    );
  }
  if (proposeQuery.isError) {
    return <div className="px-6 pb-6 text-sm text-destructive">{proposeQuery.error?.message}</div>;
  }
  if (proposeQuery.isLoading && !hasOps) {
    return <div className="px-6 pb-6 text-sm text-muted-foreground">Generating proposal…</div>;
  }
  return null;
}

export function CorrectionProposalWorkflow({
  open,
  onOpenChange,
  sessionId,
  signal,
  triggeringTransaction,
  previewTransactions,
  minConfidence,
  onApproved,
}: CorrectionProposalWorkflowProps) {
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);

  const disabledSignal: CorrectionSignal = useMemo(
    () => ({ descriptionPattern: '_', matchType: 'exact', tags: [] }),
    []
  );

  const proposeInput = useMemo(() => {
    if (!signal) return null;
    return { signal, minConfidence, maxPreviewItems: 200 };
  }, [signal, minConfidence]);

  const proposeQuery = trpc.core.corrections.proposeChangeSet.useQuery(
    proposeInput ?? { signal: disabledSignal, minConfidence, maxPreviewItems: 200 },
    {
      enabled: Boolean(open && proposeInput),
      staleTime: 0,
      retry: false,
    }
  );

  const localOpsHook = useLocalOps({
    open,
    signal,
    isBrowseMode: false,
    proposeData: proposeQuery.data,
  });

  const {
    localOps,
    setLocalOps,
    selectedClientId,
    setSelectedClientId,
    selectedOp,
    rationale,
    setRationale,
    updateOp,
    handleDeleteOp,
    handleAddNewRuleOp,
    handleAddTargetedOp,
    seededForSignalRef,
  } = localOpsHook;

  const previewHook = usePreviewEffects(
    {
      open,
      localOps,
      selectedOp,
      minConfidence,
      previewTransactions,
      dbTransactions: undefined,
      pendingChangeSets,
    },
    setLocalOps
  );

  const {
    combinedPreview,
    combinedPreviewError,
    combinedPreviewTruncated,
    selectedOpPreview,
    selectedOpPreviewError,
    selectedOpPreviewTruncated,
    previewMutationPending,
    hasDirty,
    handleRerunPreview,
    resetPreviewState,
    lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef,
  } = previewHook;

  const handleCloseRef = useRef<() => void>(() => {});

  const mutationsHook = useApplyRejectMutations({
    signal,
    sessionId,
    localOps,
    combinedPreview,
    combinedPreviewError,
    previewTransactions,
    isFetching: proposeQuery.isFetching,
    previewMutationPending,
    hasDirty,
    onApproved,
    onClose: () => {
      handleCloseRef.current();
    },
    setLocalOps,
    setSelectedClientId,
    setRationale,
    lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef,
  });

  const {
    rejectMode,
    setRejectMode,
    rejectFeedback,
    setRejectFeedback,
    aiInstruction,
    setAiInstruction,
    aiMessages,
    aiBusy,
    isBusy,
    canApply,
    handleApprove,
    handleConfirmReject,
    handleAiSubmit,
    resetMutationState,
  } = mutationsHook;

  const [previewView, setPreviewView] = useState<PreviewView>('selected');

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setLocalOps([]);
        setSelectedClientId(null);
        setPreviewView('selected');
        resetPreviewState();
        resetMutationState();
        setRationale(null);
        seededForSignalRef.current = null;
      }
    },
    [
      onOpenChange,
      resetPreviewState,
      resetMutationState,
      seededForSignalRef,
      setLocalOps,
      setRationale,
      setSelectedClientId,
    ]
  );

  handleCloseRef.current = () => handleOpenChange(false);

  const excludeIds = useMemo(() => {
    const set = new Set<string>();
    for (const op of localOps) {
      if (op.kind !== 'add') set.add(op.targetRuleId);
    }
    return set;
  }, [localOps]);

  const previewResult = previewView === 'combined' ? combinedPreview : selectedOpPreview;
  const previewError = previewView === 'combined' ? combinedPreviewError : selectedOpPreviewError;
  const previewTruncated =
    previewView === 'combined' ? combinedPreviewTruncated : selectedOpPreviewTruncated;
  const currentPreviewLabel = previewLabel(previewView, Boolean(selectedOp));

  const proposalFooter = (
    <>
      <div className="flex-1 text-xs text-muted-foreground">
        {(() => {
          if (hasDirty) return <span>Preview stale — re-run before applying.</span>;
          if (localOps.length === 0) return <span>ChangeSet is empty.</span>;
          return null;
        })()}
      </div>
      <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isBusy}>
        Cancel
      </Button>
      {!rejectMode && (
        <Button
          variant="outline"
          onClick={() => setRejectMode(true)}
          disabled={isBusy || localOps.length === 0}
        >
          Reject with feedback
        </Button>
      )}
      <Button onClick={handleApprove} disabled={!canApply}>
        Apply ChangeSet
      </Button>
    </>
  );

  const isProposalGridReady =
    Boolean(signal) && !proposeQuery.isError && !(proposeQuery.isLoading && localOps.length === 0);

  const proposalBodyState = renderProposalBodyState(signal, proposeQuery, localOps.length > 0);
  const proposalBody: ReactNode = proposalBodyState ?? (
    <>
      <OpsListPanel
        ops={localOps}
        selectedClientId={selectedClientId}
        onSelect={setSelectedClientId}
        onDelete={handleDeleteOp}
        onAddNewRule={handleAddNewRuleOp}
        onAddTargeted={handleAddTargetedOp}
        excludeIds={excludeIds}
        disabled={isBusy}
      />
      <DetailPanel
        op={selectedOp}
        onChange={(mutator) => {
          if (!selectedOp) return;
          updateOp(selectedOp.clientId, mutator);
        }}
        disabled={isBusy}
      />
      <ImpactPanel
        view={previewView}
        onViewChange={setPreviewView}
        label={currentPreviewLabel}
        previewResult={previewResult}
        previewError={previewError}
        isPending={previewMutationPending}
        stale={hasDirty}
        truncated={previewTruncated}
        onRerun={handleRerunPreview}
        disabled={isBusy || localOps.length === 0}
      />
    </>
  );

  const proposalSubpanel =
    isProposalGridReady &&
    (rejectMode ? (
      <RejectPanel
        feedback={rejectFeedback}
        onFeedbackChange={setRejectFeedback}
        onCancel={() => {
          setRejectMode(false);
          setRejectFeedback('');
        }}
        onConfirm={handleConfirmReject}
        busy={mutationsHook.rejectMutationPending}
      />
    ) : (
      <AiHelperPanel
        messages={aiMessages}
        instruction={aiInstruction}
        onInstructionChange={setAiInstruction}
        onSubmit={handleAiSubmit}
        busy={aiBusy}
      />
    ));

  const proposalContextHeader =
    isProposalGridReady && signal ? (
      <ContextPanel
        signal={signal}
        triggeringTransaction={triggeringTransaction}
        rationale={rationale}
        opCount={localOps.length}
        combinedSummary={combinedPreview?.summary ?? null}
      />
    ) : undefined;

  return (
    <WorkflowDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Correction proposal"
      description="Edit the proposed rule changes and preview their impact before applying."
      columns={isProposalGridReady ? 3 : undefined}
      header={proposalContextHeader || undefined}
      subpanel={proposalSubpanel || undefined}
      footer={proposalFooter}
    >
      {proposalBody}
    </WorkflowDialog>
  );
}
