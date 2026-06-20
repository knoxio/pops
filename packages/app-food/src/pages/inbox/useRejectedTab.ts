/**
 * PRD-138 — data + mutation hook for the Rejected tab.
 *
 * Splits the React Query plumbing out of `RejectedTab.tsx` so the page
 * component stays under the per-file line cap and the hook is testable on
 * its own. Optimistic Undo removes the row from the cached list pages
 * before the mutation resolves; failure restores it and surfaces a toast.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../food-api-helpers.js';
import { inboxListRejected, inboxUnreject } from '../../food-api/index.js';
import { type RejectedFiltersState } from './RejectedFilters.js';

import type { IngestSourceKind, RejectionReason } from '../../food-api-shared-types.js';
import type { InboxListRejectedResponses } from '../../food-api/types.gen.js';

type ListRejectedOutput = InboxListRejectedResponses[200];

type UnrejectInput = { versionId: number };
type Translate = (key: string, opts?: Record<string, unknown>) => string;
type QueryInput = {
  reasons: RejectionReason[] | undefined;
  kinds: IngestSourceKind[] | undefined;
  sinceDays: RejectedFiltersState['sinceDays'];
};

interface UseRejectedTabOpts {
  filters: RejectedFiltersState;
  t: Translate;
}

function useUndoMutation(queryInput: QueryInput, t: Translate) {
  const qc = useQueryClient();
  const listKey = ['food', 'inbox', 'listRejected', queryInput] as const;
  return useMutation({
    mutationFn: async (input: UnrejectInput) =>
      unwrap(await inboxUnreject({ body: { versionId: input.versionId } })),
    onMutate: async ({ versionId }) => {
      await qc.cancelQueries({ queryKey: ['food', 'inbox', 'listRejected'] });
      const snapshot = qc.getQueryData<ListRejectedOutput>(listKey);
      qc.setQueryData<ListRejectedOutput>(listKey, (prev) =>
        prev === undefined
          ? prev
          : { ...prev, items: prev.items.filter((row) => row.versionId !== versionId) }
      );
      return { snapshot };
    },
    onError: (err: Error, _input, ctx) => {
      if (ctx?.snapshot !== undefined) {
        qc.setQueryData<ListRejectedOutput>(listKey, ctx.snapshot);
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
      void qc.invalidateQueries({ queryKey: ['food', 'inbox', 'listRejected'] });
    },
  });
}

export function useRejectedTab({ filters, t }: UseRejectedTabOpts) {
  const queryInput: QueryInput = {
    reasons: filters.reasons.length > 0 ? [...filters.reasons] : undefined,
    kinds: filters.kinds.length > 0 ? [...filters.kinds] : undefined,
    sinceDays: filters.sinceDays,
  };
  const query = useQuery({
    queryKey: ['food', 'inbox', 'listRejected', queryInput],
    queryFn: async () =>
      unwrap(
        await inboxListRejected({
          body: {
            reasons: queryInput.reasons,
            kinds: queryInput.kinds,
            sinceDays: queryInput.sinceDays,
          },
        })
      ),
  });
  const undoMutation = useUndoMutation(queryInput, t);
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
