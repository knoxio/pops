import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { ListItemRow } from './types.js';

/**
 * Item-level mutations consumed by the detail page. Each mutation
 * invalidates the parent list's `lists.list.get` cache on success so the UI
 * rehydrates with server-confirmed state. No true optimistic update yet —
 * the page waits on the refetch round-trip. `check`/`uncheck`/`remove` are
 * fire-and-forget at the call site (no awaitable Promise) because their
 * callers don't need to chain; `update`/`reorder` await so the caller can
 * close the inline editor / roll back a failed drag.
 *
 * Future: lean on `utils.lists.list.get.setData` to apply the patch (and
 * `lists.items.check`'s server-returned `checkedAt`) before the refetch
 * lands — see `apps/pops-api/src/modules/lists/routers/items.ts:92` for the
 * server payload that's currently ignored.
 */
export interface ItemMutations {
  add: (input: AddInput) => Promise<{ id: number; position: number } | null>;
  isAdding: boolean;
  check: (id: number) => void;
  uncheck: (id: number) => void;
  update: (id: number, patch: UpdatePatch) => Promise<boolean>;
  remove: (id: number) => void;
  reorder: (orderedIds: readonly number[]) => Promise<boolean>;
  errorMessage: string | null;
  clearError: () => void;
}

interface AddInput {
  label: string;
  qty?: number | null;
  unit?: string | null;
}

interface UpdatePatch {
  label?: string;
  qty?: number | null;
  unit?: string | null;
  notes?: string | null;
}

function useItemMutationHooks(onError: (message: string) => void) {
  const handler = { onError: (err: { message: string }) => onError(err.message) };
  return {
    add: trpc.lists.items.add.useMutation(handler),
    check: trpc.lists.items.check.useMutation(handler),
    uncheck: trpc.lists.items.uncheck.useMutation(handler),
    update: trpc.lists.items.update.useMutation(handler),
    remove: trpc.lists.items.remove.useMutation(handler),
    reorder: trpc.lists.items.reorder.useMutation(handler),
  };
}

export function useItemMutations(listId: number): ItemMutations {
  const utils = trpc.useUtils();
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const invalidate = useCallback(
    () => utils.lists.list.get.invalidate({ id: listId }),
    [listId, utils]
  );
  const m = useItemMutationHooks(setError);

  const add: ItemMutations['add'] = useCallback(
    async (input) => {
      try {
        const row = await m.add.mutateAsync({ listId, ...input });
        await invalidate();
        return row;
      } catch {
        return null;
      }
    },
    [invalidate, listId, m.add]
  );
  const fireAndForget =
    (mutation: { mutate: (input: { id: number }, opts?: { onSuccess?: () => void }) => void }) =>
    (id: number) =>
      mutation.mutate({ id }, { onSuccess: () => void invalidate() });

  const update: ItemMutations['update'] = useCallback(
    async (id, patch) =>
      awaitMutation(async () => {
        await m.update.mutateAsync({ id, ...patch });
        await invalidate();
      }),
    [invalidate, m.update]
  );
  const reorder: ItemMutations['reorder'] = useCallback(
    async (orderedIds) =>
      awaitMutation(async () => {
        const result = await m.reorder.mutateAsync({ listId, orderedIds: [...orderedIds] });
        await invalidate();
        return result.ok;
      }),
    [invalidate, listId, m.reorder]
  );

  return {
    add,
    isAdding: m.add.isPending,
    check: fireAndForget(m.check),
    uncheck: fireAndForget(m.uncheck),
    update,
    remove: fireAndForget(m.remove),
    reorder,
    errorMessage,
    clearError,
  };
}

async function awaitMutation(fn: () => Promise<void | boolean>): Promise<boolean> {
  try {
    const result = await fn();
    return result ?? true;
  } catch {
    return false;
  }
}

export function optimisticToggleChecked(items: readonly ListItemRow[], id: number): ListItemRow[] {
  return items.map((row) =>
    row.id === id
      ? {
          ...row,
          checked: row.checked === 1 ? 0 : 1,
          checkedAt: row.checked === 1 ? null : new Date().toISOString(),
        }
      : row
  );
}
