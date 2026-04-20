import {
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
} from '../correction-proposal-shared';

import type { LocalOp, PreviewChangeSetOutput } from '../correction-proposal-shared';

export const EMPTY_PREVIEW_SUMMARY = {
  total: 0,
  newMatches: 0,
  removedMatches: 0,
  statusChanges: 0,
  netMatchedDelta: 0,
};

/** Compute a PreviewChangeSetOutput from a subset of diffs. */
export function subsetPreview(diffs: PreviewChangeSetOutput['diffs']): PreviewChangeSetOutput {
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

interface ScopeArgs {
  ops: LocalOp[];
  sessionTxns: Array<{ checksum?: string; description: string }>;
  dbTxns: Array<{ checksum?: string; description: string }>;
}

export function scopeAndBudget({ ops, sessionTxns, dbTxns }: ScopeArgs) {
  const { txns: scopedSession, truncated } = scopePreviewTransactions(ops, sessionTxns);
  const dbBudget = Math.max(0, PREVIEW_CHANGESET_MAX_TRANSACTIONS - scopedSession.length);
  const dbScoped = dbTxns.length > 0 ? scopePreviewTransactions(ops, dbTxns).txns : [];
  const dbSlice = dbScoped.slice(0, dbBudget);
  return {
    truncated,
    sessionTxns: scopedSession,
    dbTxns: dbSlice,
    allTxns: [...scopedSession, ...dbSlice],
    sessionSplitIndex: scopedSession.length,
  };
}
