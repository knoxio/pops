import { useEffect, useMemo, useRef, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useImportStore } from '../../../../store/importStore';
import { type PreviewView } from '../../CorrectionProposalDialogPanels';
import { useLocalOps } from '../../hooks/useLocalOps';
import { usePreviewEffects } from '../../hooks/usePreviewEffects';
import { useBrowseRules } from './useBrowseRules';
import { useBrowseSelection } from './useBrowseSelection';

export interface RuleManagerInputs {
  open: boolean;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
}

function useDialogState(open: boolean) {
  const [previewView, setPreviewView] = useState<PreviewView>('selected');
  const [browseSearch, setBrowseSearch] = useState('');
  const browseInitialPendingCountRef = useRef<number>(0);
  useEffect(() => {
    if (open) {
      browseInitialPendingCountRef.current = useImportStore.getState().pendingChangeSets.length;
    }
  }, [open]);
  return {
    previewView,
    setPreviewView,
    browseSearch,
    setBrowseSearch,
    browseInitialPendingCountRef,
  };
}

export function useRuleManagerHooks(props: RuleManagerInputs) {
  const { open, minConfidence, previewTransactions } = props;
  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const localOpsHook = useLocalOps({
    open,
    signal: null,
    isBrowseMode: true,
    proposeData: undefined,
  });
  const dialogState = useDialogState(open);
  const dbTxnsQuery = trpc.finance.transactions.listDescriptionsForPreview.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
  });
  const previewHook = usePreviewEffects(
    {
      open,
      localOps: localOpsHook.localOps,
      selectedOp: localOpsHook.selectedOp,
      minConfidence,
      previewTransactions,
      dbTransactions: dbTxnsQuery.data?.data ?? [],
      pendingChangeSets,
    },
    localOpsHook.setLocalOps
  );
  const browse = useBrowseRules({
    open,
    localOps: localOpsHook.localOps,
    browseSearch: dialogState.browseSearch,
    setLocalOps: localOpsHook.setLocalOps,
  });
  const selection = useBrowseSelection({
    setLocalOps: localOpsHook.setLocalOps,
    setSelectedClientId: localOpsHook.setSelectedClientId,
    localOps: localOpsHook.localOps,
  });
  const browseSelectedRule = useMemo(
    () => browse.browseMergedRules.find((r) => r.id === selection.browseSelectedRuleId) ?? null,
    [browse.browseMergedRules, selection.browseSelectedRuleId]
  );
  return {
    localOpsHook,
    dialogState,
    dbTxnsQuery,
    previewHook,
    browse,
    selection,
    browseSelectedRule,
  };
}
