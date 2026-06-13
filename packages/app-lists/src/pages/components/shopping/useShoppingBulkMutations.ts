import { useCallback, useState } from 'react';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { UsePillarUtilsResult } from '@pops/pillar-sdk/react';

import type { ListItemRow, ListRow } from '../../detail/types.js';

/**
 * Optimistic wrappers for PRD-141's `uncheckAll` + `removeChecked`
 * mutations. Both use `usePillarUtils().setData` on the `lists.list.get`
 * cache slot to patch the cached detail payload before the server round-trip
 * lands. The mutation's `onMutate` snapshots + applies the optimistic write
 * and returns the previous value; `onError` rolls back from that snapshot.
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

const DETAIL_PATH = ['list', 'get'] as const;

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
  utils: UsePillarUtilsResult,
  listId: number,
  updater: (prev: DetailPayload | undefined) => DetailPayload | undefined
): RollbackContext {
  const previous = utils.setData<DetailPayload>(DETAIL_PATH, { id: listId }, updater);
  return { previous };
}

function rollback(
  utils: UsePillarUtilsResult,
  listId: number,
  context: RollbackContext | undefined
): void {
  if (!context) return;
  utils.setData<DetailPayload | undefined>(DETAIL_PATH, { id: listId }, () => context.previous);
}

type ListIdInput = { listId: number };
type UncheckAllResult = { ok: true; count: number };
type RemoveCheckedResult = { ok: true; removedCount: number };

function useUncheckAllMutation(
  utils: UsePillarUtilsResult,
  listId: number,
  setError: (message: string) => void
) {
  return usePillarMutation<ListIdInput, UncheckAllResult, RollbackContext>(
    'lists',
    ['items', 'uncheckAll'],
    {
      onMutate: () =>
        snapshotAndUpdate(utils, listId, (prev) =>
          mapDetail(prev, (row) =>
            row.checked === 1 ? { ...row, checked: 0, checkedAt: null } : row
          )
        ),
      onError: (err, _vars, context) => {
        rollback(utils, listId, context);
        setError(err.message);
      },
      onSettled: () => {
        void utils.invalidate(['list', 'get']);
      },
    }
  );
}

function useRemoveCheckedMutation(
  utils: UsePillarUtilsResult,
  listId: number,
  setError: (message: string) => void
) {
  return usePillarMutation<ListIdInput, RemoveCheckedResult, RollbackContext>(
    'lists',
    ['items', 'removeChecked'],
    {
      onMutate: () =>
        snapshotAndUpdate(utils, listId, (prev) => filterDetail(prev, (row) => row.checked !== 1)),
      onError: (err, _vars, context) => {
        rollback(utils, listId, context);
        setError(err.message);
      },
      onSettled: () => {
        void utils.invalidate(['list', 'get']);
      },
    }
  );
}

export function useShoppingBulkMutations(listId: number): ShoppingBulkMutations {
  const utils = usePillarUtils('lists');
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const uncheckMx = useUncheckAllMutation(utils, listId, setError);
  const removeMx = useRemoveCheckedMutation(utils, listId, setError);

  const uncheckAll = useCallback(async () => {
    try {
      const result = await uncheckMx.mutateAsync({ listId });
      return { ok: true, count: result.count };
    } catch {
      return { ok: false, count: 0 };
    }
  }, [listId, uncheckMx]);

  const removeChecked = useCallback(async () => {
    try {
      const result = await removeMx.mutateAsync({ listId });
      return { ok: true, removedCount: result.removedCount };
    } catch {
      return { ok: false, removedCount: 0 };
    }
  }, [listId, removeMx]);

  return {
    uncheckAll,
    isUnchecking: uncheckMx.isPending,
    removeChecked,
    isRemoving: removeMx.isPending,
    errorMessage,
    clearError,
  };
}
