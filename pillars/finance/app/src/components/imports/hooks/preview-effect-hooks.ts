import { useEffect } from 'react';

import { runPreview } from './preview-effects-runner';

import type {
  LocalOp,
  PreviewChangeSetInput,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';

export type PreviewMutateAsync = (input: PreviewChangeSetInput) => Promise<PreviewChangeSetOutput>;

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
  previewMutateAsync: PreviewMutateAsync;
}

export interface CombinedEffectArgs extends BaseEffectShared {
  localOps: LocalOp[];
  combined: PreviewSlotState;
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  lastSigRef: React.MutableRefObject<string | null>;
  lastTokenRef: React.MutableRefObject<number>;
}

function opContentSig(o: LocalOp): string {
  if (o.kind === 'add') {
    const d = o.data;
    return JSON.stringify([
      o.clientId,
      d.descriptionPattern,
      d.matchType,
      d.entityName ?? '',
      d.transactionType ?? '',
      d.location ?? '',
    ]);
  }
  if (o.kind === 'edit') {
    const d = o.data;
    return JSON.stringify([
      o.clientId,
      d.descriptionPattern ?? '',
      d.matchType ?? '',
      d.entityName ?? '',
      d.transactionType ?? '',
      d.location ?? '',
    ]);
  }
  return JSON.stringify([o.clientId, o.rationale]);
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
  // Destructure stable React dispatch functions out of the slot object so
  // the effect depends on them individually (never change) rather than on
  // the `combined` object reference (new object every render). Including
  // `combined` directly would cancel in-flight previews via the cleanup
  // each time setTruncated fires synchronously inside runPreview.
  const { setPreview, setDbPreview, setError: setCombinedError, setTruncated } = combined;
  useEffect(() => {
    if (!open) {
      lastSigRef.current = null;
      return;
    }
    if (localOps.length === 0) return;
    const sig = localOps.map(opContentSig).join('|');
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
      setSession: setPreview,
      setDb: setDbPreview,
      setError: setCombinedError,
      setTruncated,
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
    setPreview,
    setDbPreview,
    setCombinedError,
    setTruncated,
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
  const { selected, normalisedDbTransactions, rerunToken, previewMutateAsync } = args;
  const { selectedOpPreviewKeyRef, lastTokenRef } = args;
  // Depend on the stable React dispatch functions individually rather than on
  // the `selected` slot object (a fresh literal every render), mirroring
  // `useCombinedEffect` — otherwise the effect re-runs and cancels its own
  // in-flight preview on every render.
  const { setPreview, setDbPreview, setError: setSelectedError, setTruncated } = selected;
  useEffect(() => {
    if (!open) return;
    if (!selectedOp) {
      setPreview(null);
      setSelectedError(null);
      setDbPreview(null);
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
      setSession: setPreview,
      setDb: setDbPreview,
      setError: setSelectedError,
      setTruncated,
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
    setPreview,
    setDbPreview,
    setSelectedError,
    setTruncated,
    selectedOpPreviewKeyRef,
    lastTokenRef,
  ]);
}
