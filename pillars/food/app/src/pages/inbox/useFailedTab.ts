/**
 * Data + retry mutation hook for the Failed-ingests tab. Wraps the
 * `ingestRetry` endpoint. The optimistic update removes the row from the
 * cached page; on success it stays gone (the next list poll won't surface it
 * because `error_code` is now NULL); on failure the snapshot is restored.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../food-api-helpers.js';
import { inboxFailedErrorCodes, inboxListFailed, ingestRetry } from '../../food-api/index.js';
import { type FailedFiltersState } from './FailedFilters.js';

import type { IngestSourceKind } from '../../food-api-shared-types.js';
import type { InboxListFailedResponses } from '../../food-api/types.gen.js';

type ListFailedOutput = InboxListFailedResponses[200];

type RetryInput = { sourceId: number };
type Translate = (key: string, opts?: Record<string, unknown>) => string;
type QueryInput = {
  errorCodes: string[] | undefined;
  kinds: IngestSourceKind[] | undefined;
  sinceDays: FailedFiltersState['sinceDays'];
};

interface UseFailedTabOpts {
  filters: FailedFiltersState;
  t: Translate;
}

function useRetryMutation(queryInput: QueryInput, t: Translate) {
  const qc = useQueryClient();
  const listKey = ['food', 'inbox', 'listFailed', queryInput] as const;
  return useMutation({
    mutationFn: async (input: RetryInput) =>
      unwrap(await ingestRetry({ body: { sourceId: input.sourceId } })),
    onMutate: async ({ sourceId }) => {
      await qc.cancelQueries({ queryKey: ['food', 'inbox', 'listFailed'] });
      const snapshot = qc.getQueryData<ListFailedOutput>(listKey);
      qc.setQueryData<ListFailedOutput>(listKey, (prev) =>
        prev === undefined
          ? prev
          : { ...prev, items: prev.items.filter((row) => row.sourceId !== sourceId) }
      );
      return { snapshot };
    },
    onError: (err: Error, _input, ctx) => {
      if (ctx?.snapshot !== undefined) {
        qc.setQueryData<ListFailedOutput>(listKey, ctx.snapshot);
      }
      toast.error(t('inbox.failed.retry.error', { message: err.message }));
    },
    onSuccess: () => {
      toast.success(t('inbox.failed.retry.success'));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['food', 'inbox', 'listFailed'] });
      void qc.invalidateQueries({ queryKey: ['food', 'inbox', 'failedErrorCodes'] });
    },
  });
}

export function useFailedTab({ filters, t }: UseFailedTabOpts) {
  const queryInput: QueryInput = {
    errorCodes: filters.errorCodes.length > 0 ? [...filters.errorCodes] : undefined,
    kinds: filters.kinds.length > 0 ? [...filters.kinds] : undefined,
    sinceDays: filters.sinceDays,
  };
  const query = useQuery({
    queryKey: ['food', 'inbox', 'listFailed', queryInput],
    queryFn: async () =>
      unwrap(
        await inboxListFailed({
          body: {
            errorCodes: queryInput.errorCodes,
            kinds: queryInput.kinds,
            sinceDays: queryInput.sinceDays,
          },
        })
      ),
  });
  const errorCodesQuery = useQuery({
    queryKey: ['food', 'inbox', 'failedErrorCodes'],
    queryFn: async () => unwrap(await inboxFailedErrorCodes()),
  });
  const retryMutation = useRetryMutation(queryInput, t);
  const retry = useCallback(
    (sourceId: number) => retryMutation.mutate({ sourceId }),
    [retryMutation]
  );
  return {
    rows: query.data?.items ?? [],
    availableErrorCodes: errorCodesQuery.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    retry,
    retryingSourceId: retryMutation.isPending ? retryMutation.variables?.sourceId : null,
  };
}
