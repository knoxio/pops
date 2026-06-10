import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { ListItemRow } from './types.js';

/**
 * Optimistic wrappers for PRD-141's `uncheckAll` + `removeChecked`
 * mutations. Both use `utils.lists.list.get.setData` to patch the cached
 * detail payload before the server round-trip lands — same pattern the
 * PRD-140-C review recommended for `lists.items.check`. Rollback restores
 * the pre-mutation snapshot if the server rejects.
 */
export interface ShoppingBulkMutations {
  uncheckAll: () => Promise<{ ok: boolean; count: number }>;
  isUnchecking: boolean;
  removeChecked: () => Promise<{ ok: boolean; removedCount: number }>;
  isRemoving: boolean;
  errorMessage: string | null;
  clearError: () => void;
}

interface CachedDetail {
  list: { id: number; archivedAt: string | null } & Record<string, unknown>;
  items: ListItemRow[];
}

function useCache(listId: number) {
  const utils = trpc.useUtils();
  const snapshot = useCallback((): CachedDetail | undefined => {
    const data = utils.lists.list.get.getData({ id: listId });
    return data === null ? undefined : (data as unknown as CachedDetail | undefined);
  }, [listId, utils]);
  const setCache = useCallback(
    (next: CachedDetail) => {
      utils.lists.list.get.setData({ id: listId }, next as unknown as never);
    },
    [listId, utils]
  );
  const restore = useCallback(
    (previous: CachedDetail | undefined) => {
      if (previous !== undefined) setCache(previous);
    },
    [setCache]
  );
  const invalidate = useCallback(
    () => utils.lists.list.get.invalidate({ id: listId }),
    [listId, utils]
  );
  return { snapshot, setCache, restore, invalidate };
}

export function useShoppingBulkMutations(listId: number): ShoppingBulkMutations {
  const cache = useCache(listId);
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const handler = { onError: (err: { message: string }) => setError(err.message) };
  const uncheckMx = trpc.lists.items.uncheckAll.useMutation(handler);
  const removeMx = trpc.lists.items.removeChecked.useMutation(handler);

  const uncheckAll = useCallback(
    () => runWithRollback(cache, () => uncheckMx.mutateAsync({ listId }), uncheckedPatch, 'count'),
    [cache, listId, uncheckMx]
  );
  const removeChecked = useCallback(
    () =>
      runWithRollback(cache, () => removeMx.mutateAsync({ listId }), removedPatch, 'removedCount'),
    [cache, listId, removeMx]
  );

  return {
    uncheckAll: uncheckAll as ShoppingBulkMutations['uncheckAll'],
    isUnchecking: uncheckMx.isPending,
    removeChecked: removeChecked as ShoppingBulkMutations['removeChecked'],
    isRemoving: removeMx.isPending,
    errorMessage,
    clearError,
  };
}

type CacheHandles = ReturnType<typeof useCache>;

async function runWithRollback<K extends 'count' | 'removedCount'>(
  cache: CacheHandles,
  call: () => Promise<{ ok: true; count?: number; removedCount?: number }>,
  patch: (previous: CachedDetail) => CachedDetail,
  resultKey: K
): Promise<{ ok: boolean } & Record<K, number>> {
  const previous = cache.snapshot();
  if (previous !== undefined) cache.setCache(patch(previous));
  try {
    const result = await call();
    await cache.invalidate();
    const value = resultKey === 'count' ? (result.count ?? 0) : (result.removedCount ?? 0);
    return { ok: true, [resultKey]: value } as { ok: boolean } & Record<K, number>;
  } catch {
    cache.restore(previous);
    return { ok: false, [resultKey]: 0 } as { ok: boolean } & Record<K, number>;
  }
}

function uncheckedPatch(previous: CachedDetail): CachedDetail {
  return {
    ...previous,
    items: previous.items.map((row) =>
      row.checked === 1 ? { ...row, checked: 0, checkedAt: null } : row
    ),
  };
}

function removedPatch(previous: CachedDetail): CachedDetail {
  return {
    ...previous,
    items: previous.items.filter((row) => row.checked !== 1),
  };
}
