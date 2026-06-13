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

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { type FailedFiltersState } from './FailedFilters.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';
import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

type ListFailedOutput = inferRouterOutputs<AppRouter>['food']['inbox']['listFailed'];
type FailedErrorCodesOutput = inferRouterOutputs<AppRouter>['food']['inbox']['failedErrorCodes'];
type RetryOutput = inferRouterOutputs<AppRouter>['food']['ingest']['retry'];

type RetryInput = { sourceId: number };
type RetryContext = { snapshot: ListFailedOutput | undefined };
type Translate = (key: string, opts?: Record<string, unknown>) => string;
type QueryInput = {
  errorCodes: readonly string[] | undefined;
  kinds: readonly string[] | undefined;
  sinceDays: FailedFiltersState['sinceDays'];
};

interface UseFailedTabOpts {
  filters: FailedFiltersState;
  t: Translate;
}

function useRetryMutation(utils: UsePillarUtilsResult, queryInput: QueryInput, t: Translate) {
  return usePillarMutation<RetryInput, RetryOutput, RetryContext>('food', ['ingest', 'retry'], {
    onMutate: ({ sourceId }) => {
      const snapshot = utils.setData<ListFailedOutput>(
        ['inbox', 'listFailed'],
        queryInput,
        (prev) =>
          prev === undefined
            ? prev
            : { ...prev, items: prev.items.filter((row) => row.sourceId !== sourceId) }
      );
      return { snapshot };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.snapshot !== undefined) {
        utils.setData<ListFailedOutput>(['inbox', 'listFailed'], queryInput, () => ctx.snapshot);
      }
      toast.error(t('inbox.failed.retry.error', { message: err.message }));
    },
    onSuccess: () => {
      toast.success(t('inbox.failed.retry.success'));
    },
    onSettled: () => {
      void utils.invalidate(['inbox', 'listFailed']);
      void utils.invalidate(['inbox', 'failedErrorCodes']);
    },
  });
}

export function useFailedTab({ filters, t }: UseFailedTabOpts) {
  const utils = usePillarUtils('food');
  const queryInput: QueryInput = {
    errorCodes: filters.errorCodes.length > 0 ? [...filters.errorCodes] : undefined,
    kinds: filters.kinds.length > 0 ? [...filters.kinds] : undefined,
    sinceDays: filters.sinceDays,
  };
  const query = usePillarQuery<ListFailedOutput>('food', ['inbox', 'listFailed'], queryInput);
  const errorCodesQuery = usePillarQuery<FailedErrorCodesOutput>(
    'food',
    ['inbox', 'failedErrorCodes'],
    undefined
  );
  const retryMutation = useRetryMutation(utils, queryInput, t);
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
