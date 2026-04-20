import { WorkflowDialog } from '@pops/ui';

import {
  type CorrectionProposalWorkflowProps,
  useWorkflowHooks,
} from './workflow/useWorkflowHooks';
import {
  renderBody,
  renderFooter,
  renderHeader,
  renderSubpanel,
  useResetOnClose,
  useViewSelection,
} from './workflow/WorkflowSlots';

export type { CorrectionProposalWorkflowProps };

export function CorrectionProposalWorkflow(props: CorrectionProposalWorkflowProps) {
  const { open, signal, triggeringTransaction } = props;
  const hooks = useWorkflowHooks(props);
  const { localOpsHook, previewHook, mutationsHook, proposeQuery, handleCloseRef } = hooks;
  const view = useViewSelection(localOpsHook, previewHook);

  const handleOpenChange = useResetOnClose({
    setLocalOps: localOpsHook.setLocalOps as never,
    setSelectedClientId: localOpsHook.setSelectedClientId,
    setPreviewView: view.setPreviewView,
    resetPreviewState: previewHook.resetPreviewState,
    resetMutationState: mutationsHook.resetMutationState,
    setRationale: localOpsHook.setRationale,
    seededForSignalRef: localOpsHook.seededForSignalRef,
    onOpenChange: props.onOpenChange,
  });
  handleCloseRef.current = () => handleOpenChange(false);

  const isProposalGridReady =
    Boolean(signal) &&
    !proposeQuery.isError &&
    !(proposeQuery.isLoading && localOpsHook.localOps.length === 0);

  return (
    <WorkflowDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Correction proposal"
      description="Edit the proposed rule changes and preview their impact before applying."
      columns={isProposalGridReady ? 3 : undefined}
      header={renderHeader(isProposalGridReady, signal, triggeringTransaction, hooks)}
      subpanel={isProposalGridReady ? renderSubpanel(mutationsHook) : undefined}
      footer={renderFooter(mutationsHook, previewHook, localOpsHook, () => handleOpenChange(false))}
    >
      {renderBody(hooks, view, signal)}
    </WorkflowDialog>
  );
}
