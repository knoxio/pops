import { EMPTY_PREVIEW_SUMMARY, scopeAndBudget, subsetPreview } from './preview-helpers';
import { localOpsToChangeSet } from './useLocalOps';

import type { trpc } from '@pops/api-client';

import type {
  LocalOp,
  PreviewChangeSetOutput,
  ServerChangeSet,
} from '../correction-proposal-shared';

interface ApplyResultArgs {
  res: PreviewChangeSetOutput;
  sessionSplitIndex: number;
  hasDb: boolean;
  setSession: (p: PreviewChangeSetOutput | null) => void;
  setDb: (p: PreviewChangeSetOutput | null) => void;
  setError: (e: string | null) => void;
}

function applyPreviewResult({
  res,
  sessionSplitIndex,
  hasDb,
  setSession,
  setDb,
  setError,
}: ApplyResultArgs) {
  const sessionDiffs = res.diffs.slice(0, sessionSplitIndex);
  const dbDiffs = res.diffs.slice(sessionSplitIndex);
  setSession(subsetPreview(sessionDiffs));
  setDb(hasDb ? subsetPreview(dbDiffs) : null);
  setError(null);
}

interface RunPreviewArgs {
  ops: LocalOp[];
  sessionTxns: Array<{ checksum?: string; description: string }>;
  dbTxns: Array<{ checksum?: string; description: string }>;
  minConfidence: number;
  pendingChangeSets: Array<{ changeSet: ServerChangeSet }>;
  previewMutateAsync: ReturnType<
    typeof trpc.core.corrections.previewChangeSet.useMutation
  >['mutateAsync'];
  setSession: (p: PreviewChangeSetOutput | null) => void;
  setDb: (p: PreviewChangeSetOutput | null) => void;
  setError: (e: string | null) => void;
  setTruncated: (t: boolean) => void;
  /** Optional gate to skip applying (e.g. when selectedOp changed). */
  shouldApply?: () => boolean;
  /** Called after success (used by combined to clear dirty flags). */
  onSuccess?: () => void;
}

export interface RunPreviewResult {
  cancel: () => void;
  empty: boolean;
}

/** Schedules a preview API call and applies the result. Returns a cancel handle and whether the txn list was empty. */
export function runPreview(args: RunPreviewArgs): RunPreviewResult {
  const { ops, sessionTxns, dbTxns, minConfidence, pendingChangeSets, previewMutateAsync } = args;
  const { setSession, setDb, setError, setTruncated, shouldApply, onSuccess } = args;
  const changeSet = localOpsToChangeSet(ops);
  if (!changeSet) return { cancel: () => undefined, empty: true };

  const { truncated, allTxns, sessionSplitIndex } = scopeAndBudget({ ops, sessionTxns, dbTxns });
  setTruncated(truncated);
  const hasDb = dbTxns.length > 0;

  if (allTxns.length === 0) {
    setSession({ diffs: [], summary: EMPTY_PREVIEW_SUMMARY });
    setDb(hasDb ? { diffs: [], summary: EMPTY_PREVIEW_SUMMARY } : null);
    setError(null);
    onSuccess?.();
    return { cancel: () => undefined, empty: true };
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
      if (cancelled || (shouldApply && !shouldApply())) return;
      applyPreviewResult({ res, sessionSplitIndex, hasDb, setSession, setDb, setError });
      onSuccess?.();
    })
    .catch((err) => {
      if (cancelled || (shouldApply && !shouldApply())) return;
      const message = err instanceof Error ? err.message : 'Preview failed';
      setError(message);
      setSession(null);
      setDb(null);
    });

  return {
    cancel: () => {
      cancelled = true;
    },
    empty: false,
  };
}
