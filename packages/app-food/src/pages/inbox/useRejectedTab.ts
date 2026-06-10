/**
 * PRD-138 — data + mutation hook for the Rejected tab.
 *
 * Splits the React Query plumbing out of `RejectedTab.tsx` so the page
 * component stays under the per-file line cap and the hook is testable on
 * its own. Optimistic Undo removes the row from the cached list pages
 * before the mutation resolves; failure restores it and surfaces a toast.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { type RejectedFiltersState } from './RejectedFilters.js';

interface UseRejectedTabOpts {
  filters: RejectedFiltersState;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function useRejectedTab({ filters, t }: UseRejectedTabOpts) {
  const utils = trpc.useUtils();
  const queryInput = {
    reasons: filters.reasons.length > 0 ? [...filters.reasons] : undefined,
    kinds: filters.kinds.length > 0 ? [...filters.kinds] : undefined,
    sinceDays: filters.sinceDays,
  };
  const query = trpc.food.inbox.listRejected.useQuery(queryInput);
  const undoMutation = trpc.food.inbox.unreject.useMutation({
    onMutate: async ({ versionId }) => {
      await utils.food.inbox.listRejected.cancel();
      const snapshot = utils.food.inbox.listRejected.getData(queryInput);
      if (snapshot !== undefined) {
        utils.food.inbox.listRejected.setData(queryInput, {
          ...snapshot,
          items: snapshot.items.filter((row) => row.versionId !== versionId),
        });
      }
      return { snapshot };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.snapshot !== undefined) {
        utils.food.inbox.listRejected.setData(queryInput, ctx.snapshot);
      }
      toast.error(t('inbox.rejected.undo.error', { message: err.message }));
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t('inbox.rejected.undo.success'));
      } else {
        toast.error(t(`inbox.rejected.undo.failure.${result.reason}` as const));
        void utils.food.inbox.listRejected.invalidate();
      }
    },
    onSettled: () => {
      void utils.food.inbox.listRejected.invalidate();
    },
  });
  const undo = useCallback(
    (versionId: number) => undoMutation.mutate({ versionId }),
    [undoMutation]
  );
  return {
    rows: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    undo,
    undoingVersionId: undoMutation.isPending ? undoMutation.variables?.versionId : null,
  };
}
