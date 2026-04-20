import { useCallback } from 'react';
import { toast } from 'sonner';

import { WorkflowDialog } from '@pops/ui';

import { useImportStore } from '../../../store/importStore';
import { type PreviewView } from '../CorrectionProposalDialogPanels';
import { localOpsToChangeSet } from '../hooks/useLocalOps';
import { buildBodyProps } from './rule-manager/build-body-props';
import { RuleManagerFooter } from './rule-manager/Footer';
import { RuleManagerBody } from './rule-manager/RuleManagerBody';
import { useRuleManagerHooks } from './rule-manager/useRuleManagerHooks';

export interface CorrectionRuleManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBrowseClose?: (hadChanges: boolean) => void;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
}

interface CleanupArgs {
  setBrowseSearch: (v: string) => void;
  setBrowseSelectedRuleId: (v: string | null) => void;
  setLocalOps: (v: never[]) => void;
  setSelectedClientId: (v: string | null) => void;
  setPreviewView: (v: PreviewView) => void;
  resetPreviewState: () => void;
}

function buildOpenChangeHandler(
  onOpenChange: (v: boolean) => void,
  onBrowseClose: ((hadChanges: boolean) => void) | undefined,
  initialPendingCountRef: React.MutableRefObject<number>,
  cleanup: CleanupArgs
) {
  return (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    const currentCount = useImportStore.getState().pendingChangeSets.length;
    const hadChanges = currentCount !== initialPendingCountRef.current;
    cleanup.setBrowseSearch('');
    cleanup.setBrowseSelectedRuleId(null);
    cleanup.setLocalOps([]);
    cleanup.setSelectedClientId(null);
    cleanup.setPreviewView('selected');
    cleanup.resetPreviewState();
    onOpenChange(false);
    onBrowseClose?.(hadChanges);
  };
}

export function CorrectionRuleManagerDialog(props: CorrectionRuleManagerDialogProps) {
  const { open, onOpenChange, onBrowseClose } = props;
  const addPendingChangeSet = useImportStore((s) => s.addPendingChangeSet);
  const hooks = useRuleManagerHooks(props);
  const { localOpsHook, dialogState, previewHook, browse, selection } = hooks;
  const { localOps, setLocalOps, setSelectedClientId, handleAddNewRuleOp } = localOpsHook;

  const handleOpenChange = useCallback(
    buildOpenChangeHandler(onOpenChange, onBrowseClose, dialogState.browseInitialPendingCountRef, {
      setBrowseSearch: dialogState.setBrowseSearch,
      setBrowseSelectedRuleId: selection.setBrowseSelectedRuleId,
      setLocalOps: setLocalOps as never,
      setSelectedClientId,
      setPreviewView: dialogState.setPreviewView,
      resetPreviewState: previewHook.resetPreviewState,
    }),
    [
      onOpenChange,
      onBrowseClose,
      dialogState,
      selection.setBrowseSelectedRuleId,
      setLocalOps,
      setSelectedClientId,
      previewHook.resetPreviewState,
    ]
  );

  const handleBrowseSave = useCallback(() => {
    if (localOps.length === 0) {
      handleOpenChange(false);
      return;
    }
    const changeSet = localOpsToChangeSet(localOps, { source: 'browse-rule-manager' });
    if (changeSet) {
      addPendingChangeSet({ changeSet, source: 'browse-rule-manager' });
      toast.success(`${localOps.length} rule change${localOps.length === 1 ? '' : 's'} saved`);
    }
    handleOpenChange(false);
  }, [addPendingChangeSet, handleOpenChange, localOps]);

  const isGridMode = !browse.browseListQuery.isError && !browse.browseListQuery.isLoading;
  const bodyProps = buildBodyProps(hooks, handleAddNewRuleOp);

  return (
    <WorkflowDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Manage Rules"
      description="Browse, search, and edit classification rules. Changes are buffered locally until import is committed."
      columns={isGridMode ? 3 : undefined}
      gridTemplate={isGridMode ? 'grid-cols-[300px_minmax(0,1fr)_360px]' : undefined}
      footer={
        <RuleManagerFooter
          localOpsCount={localOps.length}
          onCancel={() => handleOpenChange(false)}
          onSave={handleBrowseSave}
        />
      }
    >
      <RuleManagerBody {...bodyProps} />
    </WorkflowDialog>
  );
}
