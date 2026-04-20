import { useEffect } from 'react';

import { runPreview } from './preview-effects-runner';

import type { trpc } from '@pops/api-client';

import type {
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';

export interface PreviewSlotState {
  preview: PreviewChangeSetOutput | null;
  setPreview: React.Dispatch<React.SetStateAction<PreviewChangeSetOutput | null>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  truncated: boolean;
  setTruncated: React.Dispatch<React.SetStateAction<boolean>>;
  dbPreview: PreviewChangeSetOutput | null;
  setDbPreview: React.Dispatch<React.SetStateAction<PreviewChangeSetOutput | null>>;
}

interface BaseEffectShared {
  open: boolean;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  pendingChangeSets: Array<{ changeSet: ServerChangeSet }>;
  normalisedDbTransactions: Array<{ checksum?: string; description: string }>;
  rerunToken: number;
  previewMutateAsync: ReturnType<
    typeof trpc.core.corrections.previewChangeSet.useMutation
  >['mutateAsync'];
}

export interface CombinedEffectArgs extends BaseEffectShared {
  localOps: LocalOp[];
  combined: PreviewSlotState;
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  lastSigRef: React.MutableRefObject<string | null>;
  lastTokenRef: React.MutableRefObject<number>;
}

export function useCombinedEffect(args: CombinedEffectArgs): void {
  const { open, localOps, minConfidence, previewTransactions, pendingChangeSets } = args;
  const {
    combined,
    setLocalOps,
    normalisedDbTransactions,
    rerunToken,
    previewMutateAsync,
    lastSigRef,
    lastTokenRef,
  } = args;
  useEffect(() => {
    if (!open) {
      lastSigRef.current = null;
      return;
    }
    if (localOps.length === 0) return;
    const sig = localOps.map((o) => o.clientId).join('|');
    if (lastSigRef.current === sig && lastTokenRef.current === rerunToken) return;
    lastSigRef.current = sig;
    lastTokenRef.current = rerunToken;
    const handle = runPreview({
      ops: localOps,
      sessionTxns: previewTransactions,
      dbTxns: normalisedDbTransactions,
      minConfidence,
      pendingChangeSets,
      previewMutateAsync,
      setSession: (p) => combined.setPreview(p),
      setDb: (p) => combined.setDbPreview(p),
      setError: (e) => combined.setError(e),
      setTruncated: (t) => combined.setTruncated(t),
      onSuccess: () =>
        setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o))),
    });
    return handle.cancel;
  }, [
    open,
    localOps,
    rerunToken,
    previewTransactions,
    normalisedDbTransactions,
    minConfidence,
    previewMutateAsync,
    pendingChangeSets,
    setLocalOps,
    combined,
    lastSigRef,
    lastTokenRef,
  ]);
}

export interface SelectedEffectArgs extends BaseEffectShared {
  selectedOp: LocalOp | null;
  selected: PreviewSlotState;
  selectedOpPreviewKeyRef: React.MutableRefObject<string | null>;
  lastTokenRef: React.MutableRefObject<number>;
}

export function useSelectedOpEffect(args: SelectedEffectArgs): void {
  const { open, selectedOp, minConfidence, previewTransactions, pendingChangeSets } = args;
  const {
    selected,
    normalisedDbTransactions,
    rerunToken,
    previewMutateAsync,
    selectedOpPreviewKeyRef,
    lastTokenRef,
  } = args;
  useEffect(() => {
    if (!open) return;
    if (!selectedOp) {
      selected.setPreview(null);
      selected.setError(null);
      selected.setDbPreview(null);
      selectedOpPreviewKeyRef.current = null;
      return;
    }
    if (
      selectedOpPreviewKeyRef.current === selectedOp.clientId &&
      lastTokenRef.current === rerunToken
    )
      return;
    selectedOpPreviewKeyRef.current = selectedOp.clientId;
    lastTokenRef.current = rerunToken;
    const previewKey = selectedOp.clientId;
    const handle = runPreview({
      ops: [selectedOp],
      sessionTxns: previewTransactions,
      dbTxns: normalisedDbTransactions,
      minConfidence,
      pendingChangeSets,
      previewMutateAsync,
      shouldApply: () => selectedOpPreviewKeyRef.current === previewKey,
      setSession: (p) => selected.setPreview(p),
      setDb: (p) => selected.setDbPreview(p),
      setError: (e) => selected.setError(e),
      setTruncated: (t) => selected.setTruncated(t),
    });
    return handle.cancel;
  }, [
    open,
    selectedOp,
    rerunToken,
    previewTransactions,
    normalisedDbTransactions,
    minConfidence,
    previewMutateAsync,
    pendingChangeSets,
    selected,
    selectedOpPreviewKeyRef,
    lastTokenRef,
  ]);
}
