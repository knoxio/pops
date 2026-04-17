/**
 * usePreviewEffects — manages combined and selected-op preview state.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { trpc } from '../../../lib/trpc';
import {
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
} from '../correction-proposal-shared';
import { localOpsToChangeSet } from './useLocalOps';

import type {
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute a PreviewChangeSetOutput from a subset of diffs. */
function subsetPreview(diffs: PreviewChangeSetOutput['diffs']): PreviewChangeSetOutput {
  const newMatches = diffs.filter((d) => !d.before.matched && d.after.matched).length;
  const removedMatches = diffs.filter((d) => d.before.matched && !d.after.matched).length;
  const statusChanges = diffs.filter(
    (d) => d.before.matched && d.after.matched && d.before.status !== d.after.status
  ).length;
  return {
    diffs,
    summary: {
      total: diffs.length,
      newMatches,
      removedMatches,
      statusChanges,
      netMatchedDelta: newMatches - removedMatches,
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UsePreviewEffectsOptions {
  open: boolean;
  localOps: LocalOp[];
  selectedOp: LocalOp | null;
  minConfidence: number;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  /** Optional: existing DB transactions to include in browse-mode preview (PRD-032 US-06). */
  dbTransactions?: Array<{ checksum?: string | null; description: string }>;
  pendingChangeSets: Array<{ changeSet: ServerChangeSet }>;
}

export interface UsePreviewEffectsReturn {
  combinedPreview: PreviewChangeSetOutput | null;
  combinedPreviewError: string | null;
  combinedPreviewTruncated: boolean;
  /** DB-transaction portion of the combined preview (browse mode only). */
  combinedDbPreview: PreviewChangeSetOutput | null;
  selectedOpPreview: PreviewChangeSetOutput | null;
  selectedOpPreviewError: string | null;
  selectedOpPreviewTruncated: boolean;
  /** DB-transaction portion of the selected-op preview (browse mode only). */
  selectedOpDbPreview: PreviewChangeSetOutput | null;
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
  const {
    open,
    localOps,
    selectedOp,
    minConfidence,
    previewTransactions,
    dbTransactions,
    pendingChangeSets,
  } = options;

  const [combinedPreview, setCombinedPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [combinedPreviewError, setCombinedPreviewError] = useState<string | null>(null);
  const [combinedPreviewTruncated, setCombinedPreviewTruncated] = useState(false);
  const [combinedDbPreview, setCombinedDbPreview] = useState<PreviewChangeSetOutput | null>(null);

  const [selectedOpPreview, setSelectedOpPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [selectedOpPreviewError, setSelectedOpPreviewError] = useState<string | null>(null);
  const [selectedOpPreviewTruncated, setSelectedOpPreviewTruncated] = useState(false);
  const [selectedOpDbPreview, setSelectedOpDbPreview] = useState<PreviewChangeSetOutput | null>(
    null
  );
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

  /**
   * Normalise dbTransactions to the same shape as previewTransactions so they
   * can be merged into one array for the API call.  Drizzle returns checksum as
   * `string | null`; the API schema expects `string | undefined`.
   */
  const normalisedDbTransactions = useMemo(
    () =>
      (dbTransactions ?? []).map((t) => ({
        description: t.description,
        checksum: t.checksum ?? undefined,
      })),
    [dbTransactions]
  );

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

    const { txns: sessionTxns, truncated } = scopePreviewTransactions(
      localOps,
      previewTransactions
    );
    // DB transactions fill the remaining budget so that sessionTxns + dbTxns never exceeds
    // PREVIEW_CHANGESET_MAX_TRANSACTIONS (the server hard-caps at 2000).
    const dbBudget = Math.max(0, PREVIEW_CHANGESET_MAX_TRANSACTIONS - sessionTxns.length);
    const dbTxnsScoped =
      normalisedDbTransactions.length > 0
        ? scopePreviewTransactions(localOps, normalisedDbTransactions).txns
        : ([] as typeof normalisedDbTransactions);
    const dbTxns = dbTxnsScoped.slice(0, dbBudget);
    setCombinedPreviewTruncated(truncated);

    const allTxns = [...sessionTxns, ...dbTxns];
    const sessionSplitIndex = sessionTxns.length;

    if (allTxns.length === 0) {
      setCombinedPreview({ diffs: [], summary: EMPTY_PREVIEW_SUMMARY });
      setCombinedDbPreview(
        normalisedDbTransactions.length > 0 ? { diffs: [], summary: EMPTY_PREVIEW_SUMMARY } : null
      );
      setCombinedPreviewError(null);
      setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o)));
      return;
    }

    let cancelled = false;
    previewMutateAsync({
      changeSet,
      transactions: allTxns,
      minConfidence,
      pendingChangeSets:
        pendingChangeSets.length > 0
          ? pendingChangeSets.map((pcs) => ({ changeSet: pcs.changeSet }))
          : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        const sessionDiffs = res.diffs.slice(0, sessionSplitIndex);
        const dbDiffs = res.diffs.slice(sessionSplitIndex);
        setCombinedPreview(subsetPreview(sessionDiffs));
        setCombinedDbPreview(normalisedDbTransactions.length > 0 ? subsetPreview(dbDiffs) : null);
        setCombinedPreviewError(null);
        setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o)));
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Preview failed';
        setCombinedPreviewError(message);
        setCombinedPreview(null);
        setCombinedDbPreview(null);
      });
    return () => {
      cancelled = true;
    };
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
  ]);

  // Selected-op preview effect
  useEffect(() => {
    if (!open) return;
    if (!selectedOp) {
      setSelectedOpPreview(null);
      setSelectedOpPreviewError(null);
      setSelectedOpDbPreview(null);
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

    const { txns: sessionTxns, truncated } = scopePreviewTransactions([op], previewTransactions);
    const dbBudget = Math.max(0, PREVIEW_CHANGESET_MAX_TRANSACTIONS - sessionTxns.length);
    const dbTxnsScoped =
      normalisedDbTransactions.length > 0
        ? scopePreviewTransactions([op], normalisedDbTransactions).txns
        : ([] as typeof normalisedDbTransactions);
    const dbTxns = dbTxnsScoped.slice(0, dbBudget);
    setSelectedOpPreviewTruncated(truncated);
    const allTxns = [...sessionTxns, ...dbTxns];
    const sessionSplitIndex = sessionTxns.length;

    if (allTxns.length === 0) {
      setSelectedOpPreview({ diffs: [], summary: EMPTY_PREVIEW_SUMMARY });
      setSelectedOpDbPreview(
        normalisedDbTransactions.length > 0 ? { diffs: [], summary: EMPTY_PREVIEW_SUMMARY } : null
      );
      setSelectedOpPreviewError(null);
      return;
    }

    let cancelled = false;
    const previewKey = op.clientId;
    previewMutateAsync({
      changeSet,
      transactions: allTxns,
      minConfidence,
      pendingChangeSets:
        pendingChangeSets.length > 0
          ? pendingChangeSets.map((pcs) => ({ changeSet: pcs.changeSet }))
          : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        if (selectedOpPreviewKeyRef.current !== previewKey) return;
        const sessionDiffs = res.diffs.slice(0, sessionSplitIndex);
        const dbDiffs = res.diffs.slice(sessionSplitIndex);
        setSelectedOpPreview(subsetPreview(sessionDiffs));
        setSelectedOpDbPreview(normalisedDbTransactions.length > 0 ? subsetPreview(dbDiffs) : null);
        setSelectedOpPreviewError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (selectedOpPreviewKeyRef.current !== previewKey) return;
        const message = err instanceof Error ? err.message : 'Preview failed';
        setSelectedOpPreviewError(message);
        setSelectedOpPreview(null);
        setSelectedOpDbPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    selectedOp,
    rerunToken,
    previewTransactions,
    normalisedDbTransactions,
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
    setCombinedDbPreview(null);
    setSelectedOpPreview(null);
    setSelectedOpPreviewError(null);
    setSelectedOpPreviewTruncated(false);
    setSelectedOpDbPreview(null);
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
    combinedDbPreview,
    selectedOpPreview,
    selectedOpPreviewError,
    selectedOpPreviewTruncated,
    selectedOpDbPreview,
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
