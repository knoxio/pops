/**
 * usePreviewEffects — manages combined and selected-op preview state.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { trpc } from '../../../lib/trpc';
import type {
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';
import { scopePreviewTransactions } from '../correction-proposal-shared';
import { localOpsToChangeSet } from './useLocalOps';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UsePreviewEffectsOptions {
  open: boolean;
  localOps: LocalOp[];
  selectedOp: LocalOp | null;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  pendingChangeSets: Array<{ changeSet: ServerChangeSet }>;
}

export interface UsePreviewEffectsReturn {
  combinedPreview: PreviewChangeSetOutput | null;
  combinedPreviewError: string | null;
  combinedPreviewTruncated: boolean;
  selectedOpPreview: PreviewChangeSetOutput | null;
  selectedOpPreviewError: string | null;
  selectedOpPreviewTruncated: boolean;
  previewMutationPending: boolean;
  hasDirty: boolean;
  rerunToken: number;
  handleRerunPreview: () => void;
  /** Exposed for dialog close reset. */
  resetPreviewState: () => void;
  /** Refs exposed for AI revise to force re-run. */
  lastCombinedStructuralSigRef: React.MutableRefObject<string | null>;
  selectedOpPreviewKeyRef: React.MutableRefObject<string | null>;
  /** Setter used by combined preview to clear dirty flags on ops. */
  clearDirtyFlags: () => void;
}

const EMPTY_PREVIEW_SUMMARY = {
  total: 0,
  newMatches: 0,
  removedMatches: 0,
  statusChanges: 0,
  netMatchedDelta: 0,
};

export function usePreviewEffects(
  options: UsePreviewEffectsOptions,
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>
): UsePreviewEffectsReturn {
  const { open, localOps, selectedOp, minConfidence, previewTransactions, pendingChangeSets } =
    options;

  const [combinedPreview, setCombinedPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [combinedPreviewError, setCombinedPreviewError] = useState<string | null>(null);
  const [combinedPreviewTruncated, setCombinedPreviewTruncated] = useState(false);

  const [selectedOpPreview, setSelectedOpPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [selectedOpPreviewError, setSelectedOpPreviewError] = useState<string | null>(null);
  const [selectedOpPreviewTruncated, setSelectedOpPreviewTruncated] = useState(false);
  const selectedOpPreviewKeyRef = useRef<string | null>(null);

  const [rerunToken, setRerunToken] = useState(0);

  const previewMutation = trpc.core.corrections.previewChangeSet.useMutation({ retry: false });
  const previewMutateAsync = previewMutation.mutateAsync;

  const lastCombinedStructuralSigRef = useRef<string | null>(null);
  const lastCombinedRerunToken = useRef<number>(0);
  const lastSelectedRerunToken = useRef<number>(0);

  const clearDirtyFlags = useCallback(() => {
    setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o)));
  }, [setLocalOps]);

  // Combined preview effect
  useEffect(() => {
    if (!open) {
      lastCombinedStructuralSigRef.current = null;
      return;
    }
    if (localOps.length === 0) return;
    const sig = localOps.map((o) => o.clientId).join('|');
    if (
      lastCombinedStructuralSigRef.current === sig &&
      lastCombinedRerunToken.current === rerunToken
    ) {
      return;
    }
    lastCombinedStructuralSigRef.current = sig;
    lastCombinedRerunToken.current = rerunToken;

    const changeSet = localOpsToChangeSet(localOps);
    if (!changeSet) return;

    const { txns, truncated } = scopePreviewTransactions(localOps, previewTransactions);
    setCombinedPreviewTruncated(truncated);

    if (txns.length === 0) {
      setCombinedPreview({ diffs: [], summary: EMPTY_PREVIEW_SUMMARY });
      setCombinedPreviewError(null);
      setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o)));
      return;
    }

    let cancelled = false;
    previewMutateAsync({
      changeSet,
      transactions: txns,
      minConfidence,
      pendingChangeSets:
        pendingChangeSets.length > 0
          ? pendingChangeSets.map((pcs) => ({ changeSet: pcs.changeSet }))
          : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setCombinedPreview(res);
        setCombinedPreviewError(null);
        setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o)));
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Preview failed';
        setCombinedPreviewError(message);
        setCombinedPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    localOps,
    rerunToken,
    previewTransactions,
    minConfidence,
    previewMutateAsync,
    pendingChangeSets,
    setLocalOps,
  ]);

  // Selected-op preview effect
  useEffect(() => {
    if (!open) return;
    if (!selectedOp) {
      setSelectedOpPreview(null);
      setSelectedOpPreviewError(null);
      selectedOpPreviewKeyRef.current = null;
      return;
    }
    if (
      selectedOpPreviewKeyRef.current === selectedOp.clientId &&
      lastSelectedRerunToken.current === rerunToken
    ) {
      return;
    }
    selectedOpPreviewKeyRef.current = selectedOp.clientId;
    lastSelectedRerunToken.current = rerunToken;

    const op = selectedOp;
    const changeSet = localOpsToChangeSet([op]);
    if (!changeSet) return;

    const { txns, truncated } = scopePreviewTransactions([op], previewTransactions);
    setSelectedOpPreviewTruncated(truncated);

    if (txns.length === 0) {
      setSelectedOpPreview({ diffs: [], summary: EMPTY_PREVIEW_SUMMARY });
      setSelectedOpPreviewError(null);
      return;
    }

    let cancelled = false;
    const previewKey = op.clientId;
    previewMutateAsync({
      changeSet,
      transactions: txns,
      minConfidence,
      pendingChangeSets:
        pendingChangeSets.length > 0
          ? pendingChangeSets.map((pcs) => ({ changeSet: pcs.changeSet }))
          : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        if (selectedOpPreviewKeyRef.current !== previewKey) return;
        setSelectedOpPreview(res);
        setSelectedOpPreviewError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (selectedOpPreviewKeyRef.current !== previewKey) return;
        const message = err instanceof Error ? err.message : 'Preview failed';
        setSelectedOpPreviewError(message);
        setSelectedOpPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    selectedOp,
    rerunToken,
    previewTransactions,
    minConfidence,
    previewMutateAsync,
    pendingChangeSets,
  ]);

  const handleRerunPreview = useCallback(() => {
    setRerunToken((t) => t + 1);
  }, []);

  const resetPreviewState = useCallback(() => {
    setCombinedPreview(null);
    setCombinedPreviewError(null);
    setCombinedPreviewTruncated(false);
    setSelectedOpPreview(null);
    setSelectedOpPreviewError(null);
    setSelectedOpPreviewTruncated(false);
    selectedOpPreviewKeyRef.current = null;
    lastCombinedStructuralSigRef.current = null;
    lastCombinedRerunToken.current = 0;
    lastSelectedRerunToken.current = 0;
    setRerunToken(0);
  }, []);

  const hasDirty = useMemo(() => localOps.some((o) => o.dirty), [localOps]);

  return {
    combinedPreview,
    combinedPreviewError,
    combinedPreviewTruncated,
    selectedOpPreview,
    selectedOpPreviewError,
    selectedOpPreviewTruncated,
    previewMutationPending: previewMutation.isPending,
    hasDirty,
    rerunToken,
    handleRerunPreview,
    resetPreviewState,
    lastCombinedStructuralSigRef: lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef: selectedOpPreviewKeyRef,
    clearDirtyFlags,
  };
}
