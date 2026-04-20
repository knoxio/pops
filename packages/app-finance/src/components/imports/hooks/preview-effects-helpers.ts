import { useRef } from 'react';

import { type PreviewSlotState } from './preview-effect-hooks';

import type { PreviewChangeSetOutput } from '../correction-proposal-shared';

export interface PreviewRefs {
  selectedOpPreviewKeyRef: React.MutableRefObject<string | null>;
  lastCombinedStructuralSigRef: React.MutableRefObject<string | null>;
  lastCombinedRerunToken: React.MutableRefObject<number>;
  lastSelectedRerunToken: React.MutableRefObject<number>;
}

export function usePreviewRefs(): PreviewRefs {
  return {
    selectedOpPreviewKeyRef: useRef<string | null>(null),
    lastCombinedStructuralSigRef: useRef<string | null>(null),
    lastCombinedRerunToken: useRef<number>(0),
    lastSelectedRerunToken: useRef<number>(0),
  };
}

export function buildResetState(
  combined: PreviewSlotState,
  selected: PreviewSlotState,
  refs: PreviewRefs,
  setRerunToken: (n: number) => void
) {
  return () => {
    combined.setPreview(null);
    combined.setError(null);
    combined.setTruncated(false);
    combined.setDbPreview(null);
    selected.setPreview(null);
    selected.setError(null);
    selected.setTruncated(false);
    selected.setDbPreview(null);
    refs.selectedOpPreviewKeyRef.current = null;
    refs.lastCombinedStructuralSigRef.current = null;
    refs.lastCombinedRerunToken.current = 0;
    refs.lastSelectedRerunToken.current = 0;
    setRerunToken(0);
  };
}

export interface UsePreviewEffectsReturn {
  combinedPreview: PreviewChangeSetOutput | null;
  combinedPreviewError: string | null;
  combinedPreviewTruncated: boolean;
  combinedDbPreview: PreviewChangeSetOutput | null;
  selectedOpPreview: PreviewChangeSetOutput | null;
  selectedOpPreviewError: string | null;
  selectedOpPreviewTruncated: boolean;
  selectedOpDbPreview: PreviewChangeSetOutput | null;
  previewMutationPending: boolean;
  hasDirty: boolean;
  rerunToken: number;
  handleRerunPreview: () => void;
  resetPreviewState: () => void;
  lastCombinedStructuralSigRef: React.MutableRefObject<string | null>;
  selectedOpPreviewKeyRef: React.MutableRefObject<string | null>;
  clearDirtyFlags: () => void;
}

export function buildReturnValue(
  combined: PreviewSlotState,
  selected: PreviewSlotState,
  refs: PreviewRefs,
  extras: {
    previewMutationPending: boolean;
    hasDirty: boolean;
    rerunToken: number;
    handleRerunPreview: () => void;
    resetPreviewState: () => void;
    clearDirtyFlags: () => void;
  }
): UsePreviewEffectsReturn {
  return {
    combinedPreview: combined.preview,
    combinedPreviewError: combined.error,
    combinedPreviewTruncated: combined.truncated,
    combinedDbPreview: combined.dbPreview,
    selectedOpPreview: selected.preview,
    selectedOpPreviewError: selected.error,
    selectedOpPreviewTruncated: selected.truncated,
    selectedOpDbPreview: selected.dbPreview,
    lastCombinedStructuralSigRef: refs.lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef: refs.selectedOpPreviewKeyRef,
    ...extras,
  };
}
