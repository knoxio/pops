/**
 * PRD-138 — data + retry mutation hook for the Failed-ingests tab.
 *
 * Wraps PRD-125's `food.ingest.retry` mutation. Optimistic update removes
 * the row from the cached page; on success the row is gone (the next
 * `listFailed` poll won't surface it because `error_code` is now NULL);
 * on failure the snapshot is restored.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { type FailedFiltersState } from './FailedFilters.js';

interface UseFailedTabOpts {
  filters: FailedFiltersState;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function useFailedTab({ filters, t }: UseFailedTabOpts) {
  const utils = trpc.useUtils();
  const queryInput = {
    errorCodes: filters.errorCodes.length > 0 ? [...filters.errorCodes] : undefined,
    kinds: filters.kinds.length > 0 ? [...filters.kinds] : undefined,
    sinceDays: filters.sinceDays,
  };
  const query = trpc.food.inbox.listFailed.useQuery(queryInput);
  const errorCodesQuery = trpc.food.inbox.failedErrorCodes.useQuery();
  const retryMutation = trpc.food.ingest.retry.useMutation({
    onMutate: async ({ sourceId }) => {
      await utils.food.inbox.listFailed.cancel();
      const snapshot = utils.food.inbox.listFailed.getData(queryInput);
      if (snapshot !== undefined) {
        utils.food.inbox.listFailed.setData(queryInput, {
          ...snapshot,
          items: snapshot.items.filter((row) => row.sourceId !== sourceId),
        });
      }
      return { snapshot };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.snapshot !== undefined) {
        utils.food.inbox.listFailed.setData(queryInput, ctx.snapshot);
      }
      toast.error(t('inbox.failed.retry.error', { message: err.message }));
    },
    onSuccess: () => {
      toast.success(t('inbox.failed.retry.success'));
    },
    onSettled: () => {
      void utils.food.inbox.listFailed.invalidate();
      void utils.food.inbox.failedErrorCodes.invalidate();
    },
  });
  const retry = useCallback(
    (sourceId: number) => retryMutation.mutate({ sourceId }),
    [retryMutation]
  );
  return {
    rows: query.data?.items ?? [],
    availableErrorCodes: errorCodesQuery.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    retry,
    retryingSourceId: retryMutation.isPending ? retryMutation.variables?.sourceId : null,
  };
}
