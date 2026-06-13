import { useCallback, useState } from 'react';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { ListItemRow } from './types.js';

/**
 * Item-level mutations consumed by the detail page. Each mutation
 * invalidates the parent list's `lists.list.get` cache on success so the UI
 * rehydrates with server-confirmed state. No true optimistic update yet —
 * the page waits on the refetch round-trip. `check`/`uncheck`/`remove` are
 * fire-and-forget at the call site (no awaitable Promise) because their
 * callers don't need to chain; `update`/`reorder` await so the caller can
 * close the inline editor / roll back a failed drag.
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

type AddPayload = AddInput & { listId: number };
type AddResult = { id: number; position: number };
type IdInput = { id: number };
type OkResult = { ok: true } | { ok: true; checkedAt: string };
type UpdateInput = UpdatePatch & { id: number };
type ReorderInput = { listId: number; orderedIds: readonly number[] };
type ReorderResult = { ok: true } | { ok: false; reason: 'BadIds' };

function useItemMutationHooks(onError: (message: string) => void) {
  const handler = { onError: (err: { message: string }) => onError(err.message) };
  return {
    add: usePillarMutation<AddPayload, AddResult>('lists', ['items', 'add'], handler),
    check: usePillarMutation<IdInput, OkResult>('lists', ['items', 'check'], handler),
    uncheck: usePillarMutation<IdInput, OkResult>('lists', ['items', 'uncheck'], handler),
    update: usePillarMutation<UpdateInput, OkResult>('lists', ['items', 'update'], handler),
    remove: usePillarMutation<IdInput, OkResult>('lists', ['items', 'remove'], handler),
    reorder: usePillarMutation<ReorderInput, ReorderResult>('lists', ['items', 'reorder'], handler),
  };
}

export function useItemMutations(listId: number): ItemMutations {
  const utils = usePillarUtils('lists');
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  // The SDK's auto-invalidate covers the `['lists', 'items']` router prefix;
  // the detail page reads from `['lists', 'list', 'get']` so we have to
  // invalidate that slot ourselves whenever an item mutation lands.
  const invalidateDetail = useCallback(() => utils.invalidate(['list', 'get']), [utils]);
  const m = useItemMutationHooks(setError);

  const add: ItemMutations['add'] = useCallback(
    async (input) => {
      try {
        const row = await m.add.mutateAsync({ listId, ...input });
        await invalidateDetail();
        return row;
      } catch {
        return null;
      }
    },
    [invalidateDetail, listId, m.add]
  );
  const fireAndForget = (mutation: { mutate: (input: IdInput) => void }) => (id: number) => {
    mutation.mutate({ id });
    void invalidateDetail();
  };

  const update: ItemMutations['update'] = useCallback(
    async (id, patch) =>
      awaitMutation(async () => {
        await m.update.mutateAsync({ id, ...patch });
        await invalidateDetail();
      }),
    [invalidateDetail, m.update]
  );
  const reorder: ItemMutations['reorder'] = useCallback(
    async (orderedIds) =>
      awaitMutation(async () => {
        const result = await m.reorder.mutateAsync({ listId, orderedIds: [...orderedIds] });
        await invalidateDetail();
        return result.ok;
      }),
    [invalidateDetail, listId, m.reorder]
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
