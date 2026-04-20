import { type ReactNode } from 'react';

import {
  AiHelperPanel,
  ContextPanel,
  DetailPanel,
  ImpactPanel,
  OpsListPanel,
  type PreviewView,
  RejectPanel,
} from '../../CorrectionProposalDialogPanels';

import type {
  CorrectionSignal,
  TriggeringTransactionContext,
} from '../../correction-proposal-shared';

export function previewLabel(view: PreviewView, hasSelectedOp: boolean): string {
  if (view === 'combined') return 'Combined effect of entire ChangeSet';
  if (hasSelectedOp) return 'Effect of selected operation';
  return 'No operation selected';
}

interface RenderBodyArgs {
  signal: CorrectionSignal | null;
  proposeQuery: { isError: boolean; isLoading: boolean; error?: { message: string } | null };
  hasOps: boolean;
}

export function renderProposalBodyState({
  signal,
  proposeQuery,
  hasOps,
}: RenderBodyArgs): ReactNode {
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

interface ProposalBodyProps {
  localOpsHook: {
    localOps: unknown[];
    selectedClientId: string | null;
    setSelectedClientId: (id: string | null) => void;
    selectedOp: unknown;
    updateOp: (id: string, m: unknown) => void;
    handleDeleteOp: (id: string) => void;
    handleAddNewRuleOp: () => void;
    handleAddTargetedOp: unknown;
  };
  previewHook: {
    previewMutationPending: boolean;
    hasDirty: boolean;
    handleRerunPreview: () => void;
  };
  excludeIds: ReadonlySet<string>;
  isBusy: boolean;
  previewView: PreviewView;
  setPreviewView: (v: PreviewView) => void;
  currentPreviewLabel: string;
  previewResult: unknown;
  previewError: string | null;
  previewTruncated: boolean;
}

export function ProposalBody(props: ProposalBodyProps) {
  const { localOpsHook, previewHook, excludeIds, isBusy } = props;
  const ops = localOpsHook.localOps as never[];
  const selectedOp = localOpsHook.selectedOp as { clientId: string } | null;
  return (
    <>
      <OpsListPanel
        ops={ops}
        selectedClientId={localOpsHook.selectedClientId}
        onSelect={localOpsHook.setSelectedClientId}
        onDelete={localOpsHook.handleDeleteOp}
        onAddNewRule={localOpsHook.handleAddNewRuleOp}
        onAddTargeted={localOpsHook.handleAddTargetedOp as never}
        excludeIds={excludeIds}
        disabled={isBusy}
      />
      <DetailPanel
        op={selectedOp as never}
        onChange={(mutator) => {
          if (!selectedOp) return;
          localOpsHook.updateOp(selectedOp.clientId, mutator);
        }}
        disabled={isBusy}
      />
      <ImpactPanel
        view={props.previewView}
        onViewChange={props.setPreviewView}
        label={props.currentPreviewLabel}
        previewResult={props.previewResult as never}
        previewError={props.previewError}
        isPending={previewHook.previewMutationPending}
        stale={previewHook.hasDirty}
        truncated={props.previewTruncated}
        onRerun={previewHook.handleRerunPreview}
        disabled={isBusy || ops.length === 0}
      />
    </>
  );
}

export function ContextHeader({
  signal,
  triggeringTransaction,
  rationale,
  opCount,
  combinedSummary,
}: {
  signal: CorrectionSignal;
  triggeringTransaction: TriggeringTransactionContext | null;
  rationale: string | null;
  opCount: number;
  combinedSummary: never;
}) {
  return (
    <ContextPanel
      signal={signal}
      triggeringTransaction={triggeringTransaction}
      rationale={rationale}
      opCount={opCount}
      combinedSummary={combinedSummary}
    />
  );
}

interface SubpanelArgs {
  rejectMode: boolean;
  rejectFeedback: string;
  setRejectFeedback: (v: string) => void;
  setRejectMode: (v: boolean) => void;
  handleConfirmReject: () => void;
  rejectMutationPending: boolean;
  aiMessages: unknown[];
  aiInstruction: string;
  setAiInstruction: (v: string) => void;
  handleAiSubmit: () => void;
  aiBusy: boolean;
}

export function ProposalSubpanel(args: SubpanelArgs) {
  if (args.rejectMode) {
    return (
      <RejectPanel
        feedback={args.rejectFeedback}
        onFeedbackChange={args.setRejectFeedback}
        onCancel={() => {
          args.setRejectMode(false);
          args.setRejectFeedback('');
        }}
        onConfirm={args.handleConfirmReject}
        busy={args.rejectMutationPending}
      />
    );
  }
  return (
    <AiHelperPanel
      messages={args.aiMessages as never}
      instruction={args.aiInstruction}
      onInstructionChange={args.setAiInstruction}
      onSubmit={args.handleAiSubmit}
      busy={args.aiBusy}
    />
  );
}
