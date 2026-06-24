import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../../lists-api-helpers.js';
import { itemsRemoveChecked, itemsUncheckAll } from '../../../lists-api/index.js';
import { listDetailQueryKey } from '../../ListDetailPage.js';

import type { ListItemRow, ListRow } from '../../detail/types.js';

/**
 * Optimistic wrappers for the `uncheckAll` + `removeChecked` mutations.
 * Each patches the cached detail payload via the query cache before the
 * server round-trip lands. `onMutate` snapshots + applies the optimistic
 * write and returns the previous value; `onError` rolls back from that
 * snapshot.
 */
export interface ShoppingBulkMutations {
  uncheckAll: () => Promise<{ ok: boolean; count: number }>;
  isUnchecking: boolean;
  removeChecked: () => Promise<{ ok: boolean; removedCount: number }>;
  isRemoving: boolean;
  errorMessage: string | null;
  clearError: () => void;
}

type DetailPayload = { list: ListRow; items: readonly ListItemRow[] } | null;
type RollbackContext = { previous: DetailPayload | undefined };

function mapDetail(
  prev: DetailPayload | undefined,
  mapItem: (item: ListItemRow) => ListItemRow
): DetailPayload | undefined {
  if (prev === undefined || prev === null) return prev;
  return { ...prev, items: prev.items.map(mapItem) };
}

function filterDetail(
  prev: DetailPayload | undefined,
  predicate: (item: ListItemRow) => boolean
): DetailPayload | undefined {
  if (prev === undefined || prev === null) return prev;
  return { ...prev, items: prev.items.filter(predicate) };
}

function snapshotAndUpdate(
  qc: QueryClient,
  listId: number,
  updater: (prev: DetailPayload | undefined) => DetailPayload | undefined
): RollbackContext {
  const key = listDetailQueryKey(listId);
  const previous = qc.getQueryData<DetailPayload>(key);
  const next = updater(previous);
  qc.setQueryData<DetailPayload>(key, next ?? null);
  return { previous };
}

function rollback(qc: QueryClient, listId: number, context: RollbackContext | undefined): void {
  if (!context) return;
  qc.setQueryData<DetailPayload | undefined>(listDetailQueryKey(listId), context.previous);
}

interface BulkMutationOptions<TResult> {
  qc: QueryClient;
  listId: number;
  onError: (message: string) => void;
  mutationFn: () => Promise<TResult>;
  optimistic: (prev: DetailPayload | undefined) => DetailPayload | undefined;
}

function useBulkMutation<TResult>(opts: BulkMutationOptions<TResult>) {
  return useMutation({
    mutationFn: opts.mutationFn,
    onMutate: (): RollbackContext => snapshotAndUpdate(opts.qc, opts.listId, opts.optimistic),
    onError: (err: Error, _vars, context) => {
      rollback(opts.qc, opts.listId, context);
      opts.onError(err.message);
    },
    onSettled: () => {
      void opts.qc.invalidateQueries({ queryKey: listDetailQueryKey(opts.listId) });
    },
  });
}

export function useShoppingBulkMutations(listId: number): ShoppingBulkMutations {
  const qc = useQueryClient();
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const uncheckMx = useBulkMutation({
    qc,
    listId,
    onError: setError,
    mutationFn: async () => unwrap(await itemsUncheckAll({ path: { listId } })),
    optimistic: (prev) =>
      mapDetail(prev, (row) => (row.checked === 1 ? { ...row, checked: 0, checkedAt: null } : row)),
  });

  const removeMx = useBulkMutation({
    qc,
    listId,
    onError: setError,
    mutationFn: async () => unwrap(await itemsRemoveChecked({ path: { listId } })),
    optimistic: (prev) => filterDetail(prev, (row) => row.checked !== 1),
  });

  const uncheckAll = useCallback(async () => {
    try {
      const result = await uncheckMx.mutateAsync();
      return { ok: true, count: result.count };
    } catch {
      return { ok: false, count: 0 };
    }
  }, [uncheckMx]);

  const removeChecked = useCallback(async () => {
    try {
      const result = await removeMx.mutateAsync();
      return { ok: true, removedCount: result.removedCount };
    } catch {
      return { ok: false, removedCount: 0 };
    }
  }, [removeMx]);

  return {
    uncheckAll,
    isUnchecking: uncheckMx.isPending,
    removeChecked,
    isRemoving: removeMx.isPending,
    errorMessage,
    clearError,
  };
}
