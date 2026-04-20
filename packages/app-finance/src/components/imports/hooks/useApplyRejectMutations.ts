/**
 * useApplyRejectMutations — manages apply, reject, and AI revise mutations.
 *
 * Extracted from CorrectionProposalDialog (tb-364).
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { useImportStore } from '../../../store/importStore';
import { localOpsToChangeSet, serverOpToLocalOp } from './useLocalOps';

import type { ServerChangeSet } from '../correction-proposal-shared';
import type { AiMessage } from '../CorrectionProposalDialogPanels';
import type {
  UseApplyRejectMutationsOptions,
  UseApplyRejectMutationsReturn,
} from './applyRejectTypes';

export type {
  UseApplyRejectMutationsOptions,
  UseApplyRejectMutationsReturn,
} from './applyRejectTypes';

function useApplyHandlers(opts: UseApplyRejectMutationsOptions) {
  const addPendingChangeSet = useImportStore((s) => s.addPendingChangeSet);
  const handleApplyLocal = useCallback(
    (changeSet: ServerChangeSet) => {
      try {
        addPendingChangeSet({ changeSet, source: 'correction-proposal' });
        toast.success('Rules applied locally');
        opts.onApproved?.(changeSet);
        opts.onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to apply rules');
      }
    },
    [addPendingChangeSet, opts]
  );
  const handleApprove = useCallback(() => {
    const changeSet = localOpsToChangeSet(opts.localOps);
    if (!changeSet) return;
    handleApplyLocal(changeSet);
  }, [opts.localOps, handleApplyLocal]);
  return { handleApplyLocal, handleApprove };
}

function appendAssistant(
  setAiMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>,
  text: string
) {
  setAiMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text }]);
}

interface AiSubmitDeps {
  opts: UseApplyRejectMutationsOptions;
  aiInstruction: string;
  setAiInstruction: React.Dispatch<React.SetStateAction<string>>;
  setAiMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>;
  setAiBusy: React.Dispatch<React.SetStateAction<boolean>>;
  reviseMutateAsync: ReturnType<
    typeof trpc.core.corrections.reviseChangeSet.useMutation
  >['mutateAsync'];
}

async function runAiRevise(deps: AiSubmitDeps) {
  const { opts, aiInstruction, setAiInstruction, setAiMessages, setAiBusy, reviseMutateAsync } =
    deps;
  const instruction = aiInstruction.trim();
  if (!instruction || !opts.signal) return;
  const currentChangeSet = localOpsToChangeSet(opts.localOps);
  if (!currentChangeSet) {
    toast.error('ChangeSet is empty — add at least one operation before asking the AI to revise.');
    return;
  }
  setAiMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: instruction }]);
  setAiInstruction('');
  setAiBusy(true);
  try {
    const res = await reviseMutateAsync({
      signal: opts.signal,
      currentChangeSet,
      instruction,
      triggeringTransactions: opts.previewTransactions.slice(0, 100),
    });
    const revised = res.changeSet.ops.map((o) => serverOpToLocalOp(o, res.targetRules ?? {}));
    opts.setLocalOps(revised);
    opts.setSelectedClientId(revised[0]?.clientId ?? null);
    opts.setRationale(res.rationale ?? null);
    opts.lastCombinedStructuralSigRef.current = null;
    opts.selectedOpPreviewKeyRef.current = null;
    appendAssistant(setAiMessages, res.rationale ?? 'ChangeSet revised.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI helper failed';
    appendAssistant(setAiMessages, `Error: ${message}`);
    toast.error(message);
  } finally {
    setAiBusy(false);
  }
}

function useRejectAndAi(
  options: UseApplyRejectMutationsOptions,
  state: {
    rejectFeedback: string;
    aiInstruction: string;
    setAiInstruction: React.Dispatch<React.SetStateAction<string>>;
    setAiMessages: React.Dispatch<React.SetStateAction<AiMessage[]>>;
    setAiBusy: React.Dispatch<React.SetStateAction<boolean>>;
  }
) {
  const { signal, localOps, combinedPreview, onClose } = options;
  const rejectMutation = trpc.core.corrections.rejectChangeSet.useMutation({
    onSuccess: () => {
      toast.success('Proposal rejected — feedback recorded');
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });
  const reviseMutation = trpc.core.corrections.reviseChangeSet.useMutation({ retry: false });
  const handleConfirmReject = useCallback(() => {
    if (!signal) return;
    const changeSet = localOpsToChangeSet(localOps);
    if (!changeSet) return;
    const trimmed = state.rejectFeedback.trim();
    if (!trimmed) return;
    rejectMutation.mutate({
      signal,
      changeSet,
      feedback: trimmed,
      impactSummary: combinedPreview?.summary ?? undefined,
    });
  }, [signal, localOps, state.rejectFeedback, combinedPreview, rejectMutation]);
  const handleAiSubmit = useCallback(() => {
    void runAiRevise({
      opts: options,
      aiInstruction: state.aiInstruction,
      setAiInstruction: state.setAiInstruction,
      setAiMessages: state.setAiMessages,
      setAiBusy: state.setAiBusy,
      reviseMutateAsync: reviseMutation.mutateAsync,
    });
  }, [options, state, reviseMutation.mutateAsync]);
  return { rejectMutation, handleConfirmReject, handleAiSubmit };
}

export function useApplyRejectMutations(
  options: UseApplyRejectMutationsOptions
): UseApplyRejectMutationsReturn {
  const {
    localOps,
    combinedPreviewError,
    hasDirty,
    sessionId,
    isFetching,
    previewMutationPending,
  } = options;
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  const { handleApplyLocal, handleApprove } = useApplyHandlers(options);
  const { rejectMutation, handleConfirmReject, handleAiSubmit } = useRejectAndAi(options, {
    rejectFeedback,
    aiInstruction,
    setAiInstruction,
    setAiMessages,
    setAiBusy,
  });

  const isBusy = isFetching || previewMutationPending || rejectMutation.isPending || aiBusy;
  const canApply =
    !isBusy && localOps.length > 0 && !hasDirty && Boolean(sessionId) && !combinedPreviewError;

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
