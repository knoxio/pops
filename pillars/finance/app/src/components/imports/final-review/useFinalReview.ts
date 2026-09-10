import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsCommitImport,
  type ImportsCommitImportData,
  type ImportsCommitImportResponses,
} from '../../../finance-api/index.js';
import { buildCommitPayload, importSourceFor } from '../../../lib/commit-payload';
import { toRestCorrectionChangeSet } from '../../../lib/rest-changeset';
import { reconcilePendingTagRule } from '../../../lib/tag-rule-reconcile';
import { useImportStore } from '../../../store/importStore';
import { IMPORT_DRAFTS_LIST_KEY } from '../hooks/useDraftWriteThrough';
import { useTagRuleAddCollisions } from './useTagRuleAddCollisions';

import type { PendingTagRuleChangeSet } from '../../../store/importStore';

type CommitResponse = ImportsCommitImportResponses[200];
type CommitBody = NonNullable<ImportsCommitImportData['body']>;

function useStoreSlice() {
  return {
    pendingEntities: useImportStore((s) => s.pendingEntities),
    pendingChangeSets: useImportStore((s) => s.pendingChangeSets),
    pendingTagRuleChangeSets: useImportStore((s) => s.pendingTagRuleChangeSets),
    confirmedTransactions: useImportStore((s) => s.confirmedTransactions),
    processedTransactions: useImportStore((s) => s.processedTransactions),
    accountName: useImportStore((s) => s.accountName),
    dialectId: useImportStore((s) => s.dialectId),
    sourceFileNames: useImportStore((s) => s.sourceFileNames),
    prevStep: useImportStore((s) => s.prevStep),
    nextStep: useImportStore((s) => s.nextStep),
    setCommitResult: useImportStore((s) => s.setCommitResult),
    draftId: useImportStore((s) => s.draftId),
    draftSource: useImportStore((s) => s.draftSource),
    setDraftId: useImportStore((s) => s.setDraftId),
  };
}

/**
 * The staged tag rules as they will actually be committed — narrowed to the
 * tags their source rows still carry.
 *
 * Final Review reads this rather than the raw staged list so the summary is
 * the commit's own content: before POPS-3106 it displayed a rule's staged tags
 * while the commit sent something else, and the discrepancy only surfaced as
 * an atomic rejection naming a tag shown nowhere on the page.
 */
function useReconciledTagRules(slice: ReturnType<typeof useStoreSlice>) {
  const { pendingTagRuleChangeSets, confirmedTransactions } = slice;
  return useMemo(
    () =>
      pendingTagRuleChangeSets
        .map((pcs) => reconcilePendingTagRule(pcs, confirmedTransactions))
        .filter((pcs): pcs is PendingTagRuleChangeSet => pcs !== null),
    [pendingTagRuleChangeSets, confirmedTransactions]
  );
}

function useDerivedCounts(
  slice: ReturnType<typeof useStoreSlice>,
  reconciledTagRuleChangeSets: PendingTagRuleChangeSet[]
) {
  const { processedTransactions, confirmedTransactions, pendingChangeSets } = slice;
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
    () => reconciledTagRuleChangeSets.reduce((sum, pcs) => sum + pcs.changeSet.ops.length, 0),
    [reconciledTagRuleChangeSets]
  );
  return { txnBreakdown, tagAssignmentCount, taggedTxnCount, totalOps, totalTagRuleOps };
}

function commitBodyFor(slice: ReturnType<typeof useStoreSlice>, commitKey: string): CommitBody {
  const live = slice.draftSource?.kind === 'live';
  const payload = buildCommitPayload({
    pendingEntities: slice.pendingEntities,
    pendingChangeSets: slice.pendingChangeSets,
    pendingTagRuleChangeSets: slice.pendingTagRuleChangeSets,
    confirmedTransactions: slice.confirmedTransactions,
    source: live
      ? { kind: 'api', provider: 'up' }
      : importSourceFor(slice.dialectId, slice.sourceFileNames),
  });
  return {
    ...payload,
    changeSets: payload.changeSets.map(toRestCorrectionChangeSet),
    // A live draft's commit key is the draft itself: one draft, one commit,
    // however many tabs or retries send it.
    commitKey: live && slice.draftId !== null ? slice.draftId : commitKey,
    ...(slice.draftId === null ? {} : { draftId: slice.draftId }),
  };
}

/**
 * A commit key is minted once per Final Review visit — a fresh instance of
 * this hook, i.e. a fresh mount of `FinalReviewStep` (leaving and re-entering
 * the wizard step unmounts it) — and stays fixed across re-renders and
 * retries within that visit. It rides along on `commitMutation` as the
 * server-side idempotency key (#3640/#3642): a resubmit under the same key
 * (a double-click racing the `isCommitting` guard, or a manual retry after a
 * network error) replays the first call's result instead of re-applying the
 * whole commit a second time.
 */
export function useFinalReview() {
  const slice = useStoreSlice();
  const reconciledTagRuleChangeSets = useReconciledTagRules(slice);
  const counts = useDerivedCounts(slice, reconciledTagRuleChangeSets);
  const tagRuleAddCollisions = useTagRuleAddCollisions(reconciledTagRuleChangeSets);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [commitKey] = useState(() => crypto.randomUUID());
  const queryClient = useQueryClient();
  const commitMutation = useMutation({
    mutationFn: async (vars: CommitBody): Promise<CommitResponse> =>
      unwrap(await importsCommitImport({ body: vars })),
    onSuccess: (response) => {
      slice.setCommitResult(response.data);
      setCommitError(null);
      setConfirmOpen(false);
      // SummaryStep owns the post-commit UI; auto-advance there instead of
      // showing an inline panel + manual Continue click.
      slice.nextStep();
      // The commit deleted the draft in its own transaction (finance
      // ADR-005); forgetting the id here is what stops the write-through
      // from recreating it out of the Summary step's state.
      slice.setDraftId(null);
      void queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY });
      // Commit is the only write path for staged tag rules and their accepted
      // vocabulary tags (POPS-2597), so their caches go stale here, not in the
      // tag-rule dialog. This also covers ['finance', 'tagRules', 'vocabulary'],
      // the availableTags source for the tag pickers.
      void queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules'] });
    },
    onError: (err: Error) => setCommitError(err.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance', 'imports'] }),
  });
  const openConfirm = () => {
    setCommitError(null);
    setConfirmOpen(true);
  };
  const cancelConfirm = () => setConfirmOpen(false);
  const confirmCommit = () => commitMutation.mutate(commitBodyFor(slice, commitKey));
  return {
    pendingEntities: slice.pendingEntities,
    pendingChangeSets: slice.pendingChangeSets,
    pendingTagRuleChangeSets: reconciledTagRuleChangeSets,
    tagRuleAddCollisions: tagRuleAddCollisions.data,
    accountName: slice.accountName,
    ...counts,
    commitError,
    isCommitting: commitMutation.isPending,
    confirmOpen,
    openConfirm,
    cancelConfirm,
    confirmCommit,
    prevStep: slice.prevStep,
  };
}
