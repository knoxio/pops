import { useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import { buildCommitPayload } from '../../../lib/commit-payload';
import { useImportStore } from '../../../store/importStore';

function useStoreSlice() {
  return {
    pendingEntities: useImportStore((s) => s.pendingEntities),
    pendingChangeSets: useImportStore((s) => s.pendingChangeSets),
    pendingTagRuleChangeSets: useImportStore((s) => s.pendingTagRuleChangeSets),
    confirmedTransactions: useImportStore((s) => s.confirmedTransactions),
    processedTransactions: useImportStore((s) => s.processedTransactions),
    prevStep: useImportStore((s) => s.prevStep),
    nextStep: useImportStore((s) => s.nextStep),
    setCommitResult: useImportStore((s) => s.setCommitResult),
    commitResult: useImportStore((s) => s.commitResult),
  };
}

function useDerivedCounts(slice: ReturnType<typeof useStoreSlice>) {
  const {
    processedTransactions,
    confirmedTransactions,
    pendingChangeSets,
    pendingTagRuleChangeSets,
  } = slice;
  const txnBreakdown = useMemo(
    () => ({
      matched: processedTransactions.matched.length,
      corrected: processedTransactions.uncertain.length,
      manual: processedTransactions.failed.length,
      skipped: processedTransactions.skipped.length,
      total: confirmedTransactions.length,
    }),
    [processedTransactions, confirmedTransactions]
  );
  const tagAssignmentCount = useMemo(
    () => confirmedTransactions.reduce((sum, txn) => sum + (txn.tags?.length ?? 0), 0),
    [confirmedTransactions]
  );
  const taggedTxnCount = useMemo(
    () => confirmedTransactions.filter((t) => (t.tags?.length ?? 0) > 0).length,
    [confirmedTransactions]
  );
  const totalOps = useMemo(
    () => pendingChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [pendingChangeSets]
  );
  const totalTagRuleOps = useMemo(
    () => pendingTagRuleChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [pendingTagRuleChangeSets]
  );
  return { txnBreakdown, tagAssignmentCount, taggedTxnCount, totalOps, totalTagRuleOps };
}

export function useFinalReview() {
  const slice = useStoreSlice();
  const counts = useDerivedCounts(slice);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const commitMutation = trpc.finance.imports.commitImport.useMutation({
    onSuccess: (response) => {
      slice.setCommitResult(response.data);
      setCommitted(true);
      setCommitError(null);
    },
    onError: (err) => setCommitError(err.message),
  });
  const handleCommit = () => {
    setCommitError(null);
    commitMutation.mutate(
      buildCommitPayload(
        slice.pendingEntities,
        slice.pendingChangeSets,
        slice.pendingTagRuleChangeSets,
        slice.confirmedTransactions
      )
    );
  };
  return {
    pendingEntities: slice.pendingEntities,
    pendingChangeSets: slice.pendingChangeSets,
    pendingTagRuleChangeSets: slice.pendingTagRuleChangeSets,
    ...counts,
    commitError,
    committed,
    commitResult: slice.commitResult,
    isCommitting: commitMutation.isPending,
    handleCommit,
    prevStep: slice.prevStep,
    nextStep: slice.nextStep,
  };
}
