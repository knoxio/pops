import type {
  CorrectionSignal,
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';
import type { AiMessage } from '../CorrectionProposalDialogPanels';

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
  setLocalOps: React.Dispatch<React.SetStateAction<LocalOp[]>>;
  setSelectedClientId: React.Dispatch<React.SetStateAction<string | null>>;
  setRationale: React.Dispatch<React.SetStateAction<string | null>>;
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
  resetMutationState: () => void;
}
