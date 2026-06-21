import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';

import { unwrap } from '../../../../finance-api-helpers.js';
import { correctionsProposeChangeSet } from '../../../../finance-api/index.js';
import { toRestPendingChangeSets } from '../../../../lib/rest-changeset';
import { useImportStore } from '../../../../store/importStore';
import { useApplyRejectMutations } from '../../hooks/useApplyRejectMutations';
import { useLocalOps } from '../../hooks/useLocalOps';
import { usePreviewEffects } from '../../hooks/usePreviewEffects';

import type {
  CorrectionSignal,
  ProposeChangeSetOutput,
  ServerChangeSet,
  TriggeringTransactionContext,
} from '../../correction-proposal-shared';

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

export function useProposalQuery(
  signal: CorrectionSignal | null,
  open: boolean,
  minConfidence: number
) {
  const disabledSignal: CorrectionSignal = useMemo(
    () => ({ descriptionPattern: '_', matchType: 'exact', tags: [] }),
    []
  );
  const proposeInput = useMemo(
    () => (signal ? { signal, minConfidence, maxPreviewItems: 200 } : null),
    [signal, minConfidence]
  );
  return useQuery({
    queryKey: ['finance', 'corrections', 'proposeChangeSet', proposeInput],
    queryFn: async (): Promise<ProposeChangeSetOutput> =>
      unwrap(
        await correctionsProposeChangeSet({
          body: proposeInput ?? { signal: disabledSignal, minConfidence, maxPreviewItems: 200 },
        })
      ),
    enabled: Boolean(open && proposeInput),
    staleTime: 0,
    retry: false,
  });
}

export function useWorkflowHooks(props: CorrectionProposalWorkflowProps) {
  const pendingChangeSetsRaw = useImportStore((s) => s.pendingChangeSets);
  const pendingChangeSets = useMemo(
    () => toRestPendingChangeSets(pendingChangeSetsRaw),
    [pendingChangeSetsRaw]
  );
  const proposeQuery = useProposalQuery(props.signal, props.open, props.minConfidence);
  const localOpsHook = useLocalOps({
    open: props.open,
    signal: props.signal,
    isBrowseMode: false,
    proposeData: proposeQuery.data,
  });
  const previewHook = usePreviewEffects(
    {
      open: props.open,
      localOps: localOpsHook.localOps,
      selectedOp: localOpsHook.selectedOp,
      minConfidence: props.minConfidence,
      previewTransactions: props.previewTransactions,
      dbTransactions: undefined,
      pendingChangeSets,
    },
    localOpsHook.setLocalOps
  );
  const handleCloseRef = useRef<() => void>(() => undefined);
  const mutationsHook = useApplyRejectMutations({
    signal: props.signal,
    sessionId: props.sessionId,
    localOps: localOpsHook.localOps,
    combinedPreview: previewHook.combinedPreview,
    combinedPreviewError: previewHook.combinedPreviewError,
    previewTransactions: props.previewTransactions,
    isFetching: proposeQuery.isFetching,
    previewMutationPending: previewHook.previewMutationPending,
    hasDirty: previewHook.hasDirty,
    onApproved: props.onApproved,
    onClose: () => handleCloseRef.current(),
    setLocalOps: localOpsHook.setLocalOps,
    setSelectedClientId: localOpsHook.setSelectedClientId,
    setRationale: localOpsHook.setRationale,
    lastCombinedStructuralSigRef: previewHook.lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef: previewHook.selectedOpPreviewKeyRef,
  });
  return { proposeQuery, localOpsHook, previewHook, mutationsHook, handleCloseRef };
}
