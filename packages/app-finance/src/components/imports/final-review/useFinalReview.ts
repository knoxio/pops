import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsCommitImport,
  type ImportsCommitImportData,
  type ImportsCommitImportResponses,
} from '../../../finance-api/index.js';
import { buildCommitPayload } from '../../../lib/commit-payload';
import { toRestCorrectionChangeSet } from '../../../lib/rest-changeset';
import { useImportStore } from '../../../store/importStore';

type CommitResponse = ImportsCommitImportResponses[200];
type CommitBody = NonNullable<ImportsCommitImportData['body']>;

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
  const queryClient = useQueryClient();
  const commitMutation = useMutation({
    mutationFn: async (vars: CommitBody): Promise<CommitResponse> =>
      unwrap(await importsCommitImport({ body: vars })),
    onSuccess: (response) => {
      slice.setCommitResult(response.data);
      setCommitError(null);
      // SummaryStep owns the post-commit UI; auto-advance there instead of
      // showing an inline panel + manual Continue click.
      slice.nextStep();
    },
    onError: (err: Error) => setCommitError(err.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance', 'imports'] }),
  });
  const handleCommit = () => {
    setCommitError(null);
    const payload = buildCommitPayload(
      slice.pendingEntities,
      slice.pendingChangeSets,
      slice.pendingTagRuleChangeSets,
      slice.confirmedTransactions
    );
    commitMutation.mutate({
      ...payload,
      changeSets: payload.changeSets.map(toRestCorrectionChangeSet),
    });
  };
  return {
    pendingEntities: slice.pendingEntities,
    pendingChangeSets: slice.pendingChangeSets,
    pendingTagRuleChangeSets: slice.pendingTagRuleChangeSets,
    ...counts,
    commitError,
    isCommitting: commitMutation.isPending,
    handleCommit,
    prevStep: slice.prevStep,
  };
}
