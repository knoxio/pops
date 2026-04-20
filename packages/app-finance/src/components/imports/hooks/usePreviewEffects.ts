/**
 * usePreviewEffects — manages combined and selected-op preview state.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import {
  type PreviewSlotState,
  useCombinedEffect,
  useSelectedOpEffect,
} from './preview-effect-hooks';
import {
  buildResetState,
  buildReturnValue,
  usePreviewRefs,
  type UsePreviewEffectsReturn,
} from './preview-effects-helpers';

import type {
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';

export type { UsePreviewEffectsReturn } from './preview-effects-helpers';

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

function useSlot(): PreviewSlotState {
  const [preview, setPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [dbPreview, setDbPreview] = useState<PreviewChangeSetOutput | null>(null);
  return { preview, setPreview, error, setError, truncated, setTruncated, dbPreview, setDbPreview };
}

type Slot = ReturnType<typeof useSlot>;
type Refs = ReturnType<typeof usePreviewRefs>;

interface RunEffectsArgs {
  options: UsePreviewEffectsOptions;
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  combined: Slot;
  selected: Slot;
  refs: Refs;
  rerunToken: number;
  previewMutateAsync: ReturnType<
    typeof trpc.core.corrections.previewChangeSet.useMutation
  >['mutateAsync'];
  normalisedDbTransactions: Array<{ description: string; checksum?: string }>;
}

function usePreviewEffectRunners(args: RunEffectsArgs): void {
  const {
    options,
    setLocalOps,
    combined,
    selected,
    refs,
    rerunToken,
    previewMutateAsync,
    normalisedDbTransactions,
  } = args;
  useCombinedEffect({
    open: options.open,
    localOps: options.localOps,
    minConfidence: options.minConfidence,
    previewTransactions: options.previewTransactions,
    pendingChangeSets: options.pendingChangeSets,
    combined,
    setLocalOps,
    normalisedDbTransactions,
    rerunToken,
    previewMutateAsync,
    lastSigRef: refs.lastCombinedStructuralSigRef,
    lastTokenRef: refs.lastCombinedRerunToken,
  });
  useSelectedOpEffect({
    open: options.open,
    selectedOp: options.selectedOp,
    minConfidence: options.minConfidence,
    previewTransactions: options.previewTransactions,
    pendingChangeSets: options.pendingChangeSets,
    selected,
    normalisedDbTransactions,
    rerunToken,
    previewMutateAsync,
    selectedOpPreviewKeyRef: refs.selectedOpPreviewKeyRef,
    lastTokenRef: refs.lastSelectedRerunToken,
  });
}

export function usePreviewEffects(
  options: UsePreviewEffectsOptions,
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>
): UsePreviewEffectsReturn {
  const { localOps, dbTransactions } = options;
  const combined = useSlot();
  const selected = useSlot();
  const refs = usePreviewRefs();
  const [rerunToken, setRerunToken] = useState(0);
  const previewMutation = trpc.core.corrections.previewChangeSet.useMutation({ retry: false });

  const clearDirtyFlags = useCallback(
    () => setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o))),
    [setLocalOps]
  );

  const normalisedDbTransactions = useMemo(
    () =>
      (dbTransactions ?? []).map((t) => ({
        description: t.description,
        checksum: t.checksum ?? undefined,
      })),
    [dbTransactions]
  );

  usePreviewEffectRunners({
    options,
    setLocalOps,
    combined,
    selected,
    refs,
    rerunToken,
    previewMutateAsync: previewMutation.mutateAsync,
    normalisedDbTransactions,
  });

  const handleRerunPreview = useCallback(() => setRerunToken((t) => t + 1), []);
  const resetPreviewState = useCallback(buildResetState(combined, selected, refs, setRerunToken), [
    combined,
    selected,
    refs,
  ]);
  const hasDirty = useMemo(() => localOps.some((o) => o.dirty), [localOps]);

  return buildReturnValue(combined, selected, refs, {
    previewMutationPending: previewMutation.isPending,
    hasDirty,
    rerunToken,
    handleRerunPreview,
    resetPreviewState,
    clearDirtyFlags,
  });
}
