import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../lists-api-helpers.js';
import {
  itemsAdd,
  itemsCheck,
  itemsRemove,
  itemsReorder,
  itemsUncheck,
  itemsUpdate,
} from '../../lists-api/index.js';

import type { ListItemRow } from './types.js';

/**
 * Item-level mutations consumed by the detail page. Each mutation
 * invalidates the parent list's detail-`get` cache on success so the UI
 * rehydrates with server-confirmed state. `check`/`uncheck`/`remove` are
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

type ReorderResult = { ok: true } | { ok: false; reason: 'BadIds' };

function useItemMutationHooks(
  listId: number,
  onError: (message: string) => void,
  onSettled: () => void
) {
  const handleError = (err: Error) => onError(err.message);
  return {
    add: useMutation({
      mutationFn: async (input: AddInput) =>
        unwrap(await itemsAdd({ path: { listId }, body: input })),
      onError: handleError,
      onSettled,
    }),
    check: useMutation({
      mutationFn: async ({ id }: { id: number }) => unwrap(await itemsCheck({ path: { id } })),
      onError: handleError,
      onSettled,
    }),
    uncheck: useMutation({
      mutationFn: async ({ id }: { id: number }) => unwrap(await itemsUncheck({ path: { id } })),
      onError: handleError,
      onSettled,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: UpdatePatch & { id: number }) =>
        unwrap(await itemsUpdate({ path: { id }, body })),
      onError: handleError,
      onSettled,
    }),
    remove: useMutation({
      mutationFn: async ({ id }: { id: number }) => unwrap(await itemsRemove({ path: { id } })),
      onError: handleError,
      onSettled,
    }),
    reorder: useMutation({
      mutationFn: async (orderedIds: readonly number[]): Promise<ReorderResult> =>
        unwrap(await itemsReorder({ path: { listId }, body: { orderedIds: [...orderedIds] } })),
      onError: handleError,
      onSettled,
    }),
  };
}

export function useItemMutations(listId: number): ItemMutations {
  const qc = useQueryClient();
  const [errorMessage, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const invalidateDetail = useCallback(
    () => qc.invalidateQueries({ queryKey: ['lists', 'list', 'get'] }),
    [qc]
  );
  const m = useItemMutationHooks(listId, setError, () => void invalidateDetail());

  const add: ItemMutations['add'] = useCallback(
    async (input) => {
      try {
        return await m.add.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [m.add]
  );

  const update: ItemMutations['update'] = useCallback(
    async (id, patch) =>
      awaitMutation(async () => {
        await m.update.mutateAsync({ id, ...patch });
      }),
    [m.update]
  );
  const reorder: ItemMutations['reorder'] = useCallback(
    async (orderedIds) =>
      awaitMutation(async () => {
        const result = await m.reorder.mutateAsync(orderedIds);
        return result.ok;
      }),
    [m.reorder]
  );

  const fireCheck = useCallback((id: number) => m.check.mutate({ id }), [m.check]);
  const fireUncheck = useCallback((id: number) => m.uncheck.mutate({ id }), [m.uncheck]);
  const fireRemove = useCallback((id: number) => m.remove.mutate({ id }), [m.remove]);

  return {
    add,
    isAdding: m.add.isPending,
    check: fireCheck,
    uncheck: fireUncheck,
    update,
    remove: fireRemove,
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
