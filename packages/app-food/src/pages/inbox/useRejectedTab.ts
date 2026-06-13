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

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { type RejectedFiltersState } from './RejectedFilters.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';
import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

type ListRejectedOutput = inferRouterOutputs<AppRouter>['food']['inbox']['listRejected'];
type UnrejectOutput = inferRouterOutputs<AppRouter>['food']['inbox']['unreject'];

type UnrejectInput = { versionId: number };
type UnrejectContext = { snapshot: ListRejectedOutput | undefined };
type Translate = (key: string, opts?: Record<string, unknown>) => string;
type QueryInput = {
  reasons: readonly string[] | undefined;
  kinds: readonly string[] | undefined;
  sinceDays: RejectedFiltersState['sinceDays'];
};

interface UseRejectedTabOpts {
  filters: RejectedFiltersState;
  t: Translate;
}

function useUndoMutation(utils: UsePillarUtilsResult, queryInput: QueryInput, t: Translate) {
  return usePillarMutation<UnrejectInput, UnrejectOutput, UnrejectContext>(
    'food',
    ['inbox', 'unreject'],
    {
      onMutate: ({ versionId }) => {
        const snapshot = utils.setData<ListRejectedOutput>(
          ['inbox', 'listRejected'],
          queryInput,
          (prev) =>
            prev === undefined
              ? prev
              : { ...prev, items: prev.items.filter((row) => row.versionId !== versionId) }
        );
        return { snapshot };
      },
      onError: (err, _input, ctx) => {
        if (ctx?.snapshot !== undefined) {
          utils.setData<ListRejectedOutput>(
            ['inbox', 'listRejected'],
            queryInput,
            () => ctx.snapshot
          );
        }
        toast.error(t('inbox.rejected.undo.error', { message: err.message }));
      },
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(t('inbox.rejected.undo.success'));
        } else {
          toast.error(t(`inbox.rejected.undo.failure.${result.reason}` as const));
        }
      },
      onSettled: () => {
        void utils.invalidate(['inbox', 'listRejected']);
      },
    }
  );
}

export function useRejectedTab({ filters, t }: UseRejectedTabOpts) {
  const utils = usePillarUtils('food');
  const queryInput: QueryInput = {
    reasons: filters.reasons.length > 0 ? [...filters.reasons] : undefined,
    kinds: filters.kinds.length > 0 ? [...filters.kinds] : undefined,
    sinceDays: filters.sinceDays,
  };
  const query = usePillarQuery<ListRejectedOutput>('food', ['inbox', 'listRejected'], queryInput);
  const undoMutation = useUndoMutation(utils, queryInput, t);
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
