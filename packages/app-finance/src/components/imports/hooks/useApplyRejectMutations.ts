/**
 * useApplyRejectMutations — manages apply, reject, and AI revise mutations.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '../../../lib/trpc';
import { useImportStore } from '../../../store/importStore';
import { localOpsToChangeSet, serverOpToLocalOp } from './useLocalOps';

import type {
  CorrectionSignal,
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';
import type { AiMessage } from '../CorrectionProposalDialogPanels';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseApplyRejectMutationsOptions {
  signal: CorrectionSignal | null;
  sessionId: string;
  localOps: LocalOp[];
  combinedPreview: PreviewChangeSetOutput | null;
  combinedPreviewError: string | null;
  previewTransactions: Array<{ checksum?: string; description: string }>;
  isFetching: boolean;
  previewMutationPending: boolean;
  hasDirty: boolean;
  onApproved?: (changeSet: ServerChangeSet) => void;
  onClose: () => void;
  /** Callbacks to update local ops state after AI revise. */
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  setSelectedClientId: React.Dispatch<React.SetStateAction<string | null>>;
  setRationale: React.Dispatch<React.SetStateAction<string | null>>;
  /** Refs to invalidate after AI revise to force preview re-run. */
  lastCombinedStructuralSigRef: React.MutableRefObject<string | null>;
  selectedOpPreviewKeyRef: React.MutableRefObject<string | null>;
}

export interface UseApplyRejectMutationsReturn {
  rejectMode: boolean;
  setRejectMode: React.Dispatch<React.SetStateAction<boolean>>;
  rejectFeedback: string;
  setRejectFeedback: React.Dispatch<React.SetStateAction<string>>;
  aiInstruction: string;
  setAiInstruction: React.Dispatch<React.SetStateAction<string>>;
  aiMessages: AiMessage[];
  setAiMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>;
  aiBusy: boolean;
  isBusy: boolean;
  canApply: boolean;
  handleApprove: () => void;
  handleConfirmReject: () => void;
  handleAiSubmit: () => void;
  handleApplyLocal: (changeSet: ServerChangeSet) => void;
  rejectMutationPending: boolean;
  /** Reset all mutation-related state. */
  resetMutationState: () => void;
}

export function useApplyRejectMutations(
  options: UseApplyRejectMutationsOptions
): UseApplyRejectMutationsReturn {
  const {
    signal,
    sessionId,
    localOps,
    combinedPreview,
    combinedPreviewError,
    previewTransactions,
    isFetching,
    previewMutationPending,
    hasDirty,
    onApproved,
    onClose,
    setLocalOps,
    setSelectedClientId,
    setRationale,
    lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef,
  } = options;

  const [rejectMode, setRejectMode] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  const addPendingChangeSet = useImportStore((s) => s.addPendingChangeSet);

  const rejectMutation = trpc.core.corrections.rejectChangeSet.useMutation({
    onSuccess: () => {
      toast.success('Proposal rejected — feedback recorded');
      onClose();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const reviseMutation = trpc.core.corrections.reviseChangeSet.useMutation({ retry: false });
  const reviseMutateAsync = reviseMutation.mutateAsync;

  const isBusy = isFetching || previewMutationPending || rejectMutation.isPending || aiBusy;

  const canApply =
    !isBusy && localOps.length > 0 && !hasDirty && Boolean(sessionId) && !combinedPreviewError;

  const handleApplyLocal = useCallback(
    (changeSet: ServerChangeSet) => {
      try {
        addPendingChangeSet({ changeSet, source: 'correction-proposal' });
        toast.success('Rules applied locally');
        onApproved?.(changeSet);
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to apply rules');
      }
    },
    [addPendingChangeSet, onApproved, onClose]
  );

  const handleApprove = useCallback(() => {
    const changeSet = localOpsToChangeSet(localOps);
    if (!changeSet) return;
    handleApplyLocal(changeSet);
  }, [localOps, handleApplyLocal]);

  const handleConfirmReject = useCallback(() => {
    if (!signal) return;
    const changeSet = localOpsToChangeSet(localOps);
    if (!changeSet) return;
    const trimmed = rejectFeedback.trim();
    if (!trimmed) return;
    rejectMutation.mutate({
      signal,
      changeSet,
      feedback: trimmed,
      impactSummary: combinedPreview?.summary ?? undefined,
    });
  }, [signal, localOps, rejectFeedback, combinedPreview, rejectMutation]);

  const handleAiSubmit = useCallback(() => {
    const instruction = aiInstruction.trim();
    if (!instruction) return;
    if (!signal) return;
    const currentChangeSet = localOpsToChangeSet(localOps);
    if (!currentChangeSet) {
      toast.error(
        'ChangeSet is empty — add at least one operation before asking the AI to revise.'
      );
      return;
    }

    const userMsgId = `u-${Date.now()}`;
    setAiMessages((prev) => [...prev, { id: userMsgId, role: 'user', text: instruction }]);
    setAiInstruction('');
    setAiBusy(true);

    reviseMutateAsync({
      signal,
      currentChangeSet,
      instruction,
      triggeringTransactions: previewTransactions.slice(0, 100),
    })
      .then((res) => {
        const revised = res.changeSet.ops.map((o) => serverOpToLocalOp(o, res.targetRules ?? {}));
        setLocalOps(revised);
        setSelectedClientId(revised[0]?.clientId ?? null);
        setRationale(res.rationale ?? null);
        lastCombinedStructuralSigRef.current = null;
        selectedOpPreviewKeyRef.current = null;
        setAiMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', text: res.rationale ?? 'ChangeSet revised.' },
        ]);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'AI helper failed';
        setAiMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', text: `Error: ${message}` },
        ]);
        toast.error(message);
      })
      .finally(() => {
        setAiBusy(false);
      });
  }, [
    aiInstruction,
    signal,
    previewTransactions,
    localOps,
    reviseMutateAsync,
    setLocalOps,
    setSelectedClientId,
    setRationale,
    lastCombinedStructuralSigRef,
    selectedOpPreviewKeyRef,
  ]);

  const resetMutationState = useCallback(() => {
    setRejectMode(false);
    setRejectFeedback('');
    setAiInstruction('');
    setAiMessages([]);
    setAiBusy(false);
  }, []);

  return {
    rejectMode,
    setRejectMode,
    rejectFeedback,
    setRejectFeedback,
    aiInstruction,
    setAiInstruction,
    aiMessages,
    setAiMessages,
    aiBusy,
    isBusy,
    canApply,
    handleApprove,
    handleConfirmReject,
    handleAiSubmit,
    handleApplyLocal,
    rejectMutationPending: rejectMutation.isPending,
    resetMutationState,
  };
}
