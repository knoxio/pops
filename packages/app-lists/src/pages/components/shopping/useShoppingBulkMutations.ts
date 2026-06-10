import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

/**
 * Optimistic wrappers for PRD-141's `uncheckAll` + `removeChecked`
 * mutations. Both use `utils.lists.list.get.setData`'s updater form to
 * patch the cached detail payload before the server round-trip lands;
 * `setData` infers the wire shape from the tRPC router so we don't need
 * any structural casts. Rollback restores the pre-mutation snapshot if
 * the server rejects.
 */
export interface ShoppingBulkMutations {
  uncheckAll: () => Promise<{ ok: boolean; count: number }>;
  isUnchecking: boolean;
  removeChecked: () => Promise<{ ok: boolean; removedCount: number }>;
  isRemoving: boolean;
  errorMessage: string | null;
  clearError: () => void;
}

type DetailQueryUtils = ReturnType<typeof trpc.useUtils>['lists']['list']['get'];
type DetailSnapshot = ReturnType<DetailQueryUtils['getData']>;

function useCache(listId: number) {
  const utils = trpc.useUtils();
  const get = utils.lists.list.get;
  const snapshot = useCallback((): DetailSnapshot => get.getData({ id: listId }), [get, listId]);
  const restore = useCallback(
    (previous: DetailSnapshot) => {
      if (previous !== undefined) get.setData({ id: listId }, previous);
    },
    [get, listId]
  );
  const update = useCallback(
    (mapItem: (item: ItemOf<DetailSnapshot>) => ItemOf<DetailSnapshot>): void => {
      get.setData({ id: listId }, (prev) => mapDetail(prev, mapItem));
    },
    [get, listId]
  );
  const filter = useCallback(
    (predicate: (item: ItemOf<DetailSnapshot>) => boolean): void => {
      get.setData({ id: listId }, (prev) => filterDetail(prev, predicate));
    },
    [get, listId]
  );
  const invalidate = useCallback(() => get.invalidate({ id: listId }), [get, listId]);
  return { snapshot, restore, update, filter, invalidate };
}

type NonNullPayload = Exclude<DetailSnapshot, null | undefined>;
type ItemOf<T> = T extends { items: readonly (infer U)[] } ? U : never;

function mapDetail(
  prev: DetailSnapshot,
  mapItem: (item: ItemOf<DetailSnapshot>) => ItemOf<DetailSnapshot>
): DetailSnapshot {
  if (prev === undefined || prev === null) return prev;
  const next: NonNullPayload = { ...prev, items: prev.items.map(mapItem) };
  return next;
}

function filterDetail(
  prev: DetailSnapshot,
  predicate: (item: ItemOf<DetailSnapshot>) => boolean
): DetailSnapshot {
  if (prev === undefined || prev === null) return prev;
  const next: NonNullPayload = { ...prev, items: prev.items.filter(predicate) };
  return next;
}

export function useShoppingBulkMutations(listId: number): ShoppingBulkMutations {
  const cache = useCache(listId);
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const handler = { onError: (err: { message: string }) => setError(err.message) };
  const uncheckMx = trpc.lists.items.uncheckAll.useMutation(handler);
  const removeMx = trpc.lists.items.removeChecked.useMutation(handler);

  const uncheckAll = useCallback(async () => {
    const previous = cache.snapshot();
    cache.update((row) => (row.checked === 1 ? { ...row, checked: 0, checkedAt: null } : row));
    try {
      const result = await uncheckMx.mutateAsync({ listId });
      await cache.invalidate();
      return { ok: true, count: result.count };
    } catch {
      cache.restore(previous);
      return { ok: false, count: 0 };
    }
  }, [cache, listId, uncheckMx]);

  const removeChecked = useCallback(async () => {
    const previous = cache.snapshot();
    cache.filter((row) => row.checked !== 1);
    try {
      const result = await removeMx.mutateAsync({ listId });
      await cache.invalidate();
      return { ok: true, removedCount: result.removedCount };
    } catch {
      cache.restore(previous);
      return { ok: false, removedCount: 0 };
    }
  }, [cache, listId, removeMx]);

  return {
    uncheckAll,
    isUnchecking: uncheckMx.isPending,
    removeChecked,
    isRemoving: removeMx.isPending,
    errorMessage,
    clearError,
  };
}
