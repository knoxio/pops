import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { type PreviewView } from '../../CorrectionProposalDialogPanels';
import {
  ContextHeader,
  ProposalBody,
  ProposalSubpanel,
  previewLabel,
  renderProposalBodyState,
} from './WorkflowPanels';

import type { CorrectionProposalWorkflowProps, useWorkflowHooks } from './useWorkflowHooks';

interface FooterProps {
  hasDirty: boolean;
  opsLength: number;
  isBusy: boolean;
  rejectMode: boolean;
  setRejectMode: (v: boolean) => void;
  canApply: boolean;
  handleApprove: () => void;
  handleClose: () => void;
}

export function ProposalFooter(props: FooterProps) {
  let stateMsg: ReactNode = null;
  if (props.hasDirty) stateMsg = <span>Preview stale — re-run before applying.</span>;
  else if (props.opsLength === 0) stateMsg = <span>ChangeSet is empty.</span>;
  return (
    <>
      <div className="flex-1 text-xs text-muted-foreground">{stateMsg}</div>
      <Button variant="outline" onClick={props.handleClose} disabled={props.isBusy}>
        Cancel
      </Button>
      {!props.rejectMode && (
        <Button
          variant="outline"
          onClick={() => props.setRejectMode(true)}
          disabled={props.isBusy || props.opsLength === 0}
        >
          Reject with feedback
        </Button>
      )}
      <Button onClick={props.handleApprove} disabled={!props.canApply}>
        Apply ChangeSet
      </Button>
    </>
  );
}

interface ResetArgs {
  setLocalOps: (v: never[]) => void;
  setSelectedClientId: (v: string | null) => void;
  setPreviewView: (v: PreviewView) => void;
  resetPreviewState: () => void;
  resetMutationState: () => void;
  setRationale: (v: string | null) => void;
  seededForSignalRef: React.MutableRefObject<string | null>;
  onOpenChange: (v: boolean) => void;
}

export function useResetOnClose(args: ResetArgs) {
  return useCallback(
    (nextOpen: boolean) => {
      args.onOpenChange(nextOpen);
      if (nextOpen) return;
      args.setLocalOps([]);
      args.setSelectedClientId(null);
      args.setPreviewView('selected');
      args.resetPreviewState();
      args.resetMutationState();
      args.setRationale(null);
      args.seededForSignalRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      args.onOpenChange,
      args.resetPreviewState,
      args.resetMutationState,
      args.seededForSignalRef,
      args.setLocalOps,
      args.setRationale,
      args.setSelectedClientId,
      args.setPreviewView,
    ]
  );
}

export interface ViewSelection {
  previewView: PreviewView;
  setPreviewView: React.Dispatch<React.SetStateAction<PreviewView>>;
  previewResult: unknown;
  previewError: string | null;
  previewTruncated: boolean;
  currentPreviewLabel: string;
  excludeIds: ReadonlySet<string>;
}

export function useViewSelection(
  localOpsHook: ReturnType<typeof useWorkflowHooks>['localOpsHook'],
  previewHook: ReturnType<typeof useWorkflowHooks>['previewHook']
): ViewSelection {
  const [previewView, setPreviewView] = useState<PreviewView>('selected');
  const excludeIds = useMemo(() => {
    const set = new Set<string>();
    for (const op of localOpsHook.localOps) if (op.kind !== 'add') set.add(op.targetRuleId);
    return set;
  }, [localOpsHook.localOps]);
  const isCombined = previewView === 'combined';
  return {
    previewView,
    setPreviewView,
    previewResult: isCombined ? previewHook.combinedPreview : previewHook.selectedOpPreview,
    previewError: isCombined
      ? previewHook.combinedPreviewError
      : previewHook.selectedOpPreviewError,
    previewTruncated: isCombined
      ? previewHook.combinedPreviewTruncated
      : previewHook.selectedOpPreviewTruncated,
    currentPreviewLabel: previewLabel(previewView, Boolean(localOpsHook.selectedOp)),
    excludeIds,
  };
}

export function renderBody(
  hooks: ReturnType<typeof useWorkflowHooks>,
  view: ViewSelection,
  signal: CorrectionProposalWorkflowProps['signal']
): ReactNode {
  const state = renderProposalBodyState({
    signal,
    proposeQuery: hooks.proposeQuery,
    hasOps: hooks.localOpsHook.localOps.length > 0,
  });
  if (state) return state;
  return (
    <ProposalBody
      localOpsHook={hooks.localOpsHook as never}
      previewHook={hooks.previewHook as never}
      excludeIds={view.excludeIds}
      isBusy={hooks.mutationsHook.isBusy}
      previewView={view.previewView}
      setPreviewView={view.setPreviewView}
      currentPreviewLabel={view.currentPreviewLabel}
      previewResult={view.previewResult}
      previewError={view.previewError}
      previewTruncated={view.previewTruncated}
    />
  );
}

export function renderHeader(
  ready: boolean,
  signal: CorrectionProposalWorkflowProps['signal'],
  triggeringTransaction: CorrectionProposalWorkflowProps['triggeringTransaction'],
  hooks: ReturnType<typeof useWorkflowHooks>
): ReactNode {
  if (!ready || !signal) return undefined;
  return (
    <ContextHeader
      signal={signal}
      triggeringTransaction={triggeringTransaction}
      rationale={hooks.localOpsHook.rationale}
      opCount={hooks.localOpsHook.localOps.length}
      combinedSummary={(hooks.previewHook.combinedPreview?.summary ?? null) as never}
    />
  );
}

export function renderSubpanel(m: ReturnType<typeof useWorkflowHooks>['mutationsHook']): ReactNode {
  return (
    <ProposalSubpanel
      rejectMode={m.rejectMode}
      rejectFeedback={m.rejectFeedback}
      setRejectFeedback={m.setRejectFeedback}
      setRejectMode={m.setRejectMode}
      handleConfirmReject={m.handleConfirmReject}
      rejectMutationPending={m.rejectMutationPending}
      aiMessages={m.aiMessages}
      aiInstruction={m.aiInstruction}
      setAiInstruction={m.setAiInstruction}
      handleAiSubmit={m.handleAiSubmit}
      aiBusy={m.aiBusy}
    />
  );
}

export function renderFooter(
  m: ReturnType<typeof useWorkflowHooks>['mutationsHook'],
  p: ReturnType<typeof useWorkflowHooks>['previewHook'],
  l: ReturnType<typeof useWorkflowHooks>['localOpsHook'],
  handleClose: () => void
): ReactNode {
  return (
    <ProposalFooter
      hasDirty={p.hasDirty}
      opsLength={l.localOps.length}
      isBusy={m.isBusy}
      rejectMode={m.rejectMode}
      setRejectMode={m.setRejectMode}
      canApply={m.canApply}
      handleApprove={m.handleApprove}
      handleClose={handleClose}
    />
  );
}
