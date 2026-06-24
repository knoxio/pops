/**
 * Handlers for the `items.*` ts-rest sub-router (item CRUD + bulk).
 *
 * Pure pass-throughs to the list-items service; ts-rest takes care of
 * input validation. Service errors are funnelled through
 * `tryMapServiceError` so HTTP semantics stay consistent across the
 * whole REST surface.
 */
import {
  addItem,
  bulkAdd,
  listItemsService,
  removeCheckedItems,
  removeItem,
  reorderItems,
  searchListItems,
  updateItem,
  upsertItemByRef,
} from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';

import type { ListsDb, UpsertConflictMode, UpsertRefKind } from '../../db/index.js';

type RefKind = 'free' | 'ingredient' | 'variant' | 'recipe' | 'custom';

type ListKind = 'shopping' | 'packing' | 'todo' | 'generic';

interface ConflictBody {
  message: string;
  code?: string;
}

type AddItemBody = Omit<Parameters<typeof addItem>[1], 'listId'> & {
  refKind?: RefKind;
};

function notFoundOrConflict(
  err: unknown
): { kind: 'notFound'; body: ConflictBody } | { kind: 'conflict'; body: ConflictBody } | null {
  const mapped = tryMapServiceError(err);
  if (mapped === null) return null;
  if (mapped.status === 404) return { kind: 'notFound', body: mapped.body };
  return { kind: 'conflict', body: { message: mapped.body.message, code: mapped.body.code } };
}

function isPermutationOfList(current: readonly number[], candidate: readonly number[]): boolean {
  if (current.length !== candidate.length) return false;
  const uniq = new Set(candidate);
  if (uniq.size !== candidate.length) return false;
  const currentSet = new Set(current);
  for (const id of candidate) {
    if (!currentSet.has(id)) return false;
  }
  return true;
}

export function makeItemsHandlers(db: ListsDb) {
  return {
    search: async ({
      query,
    }: {
      query: {
        kind?: ListKind;
        listId?: number;
        includeArchived?: boolean;
        labelContains?: string;
        notesContains?: string;
      };
    }) => {
      const items = searchListItems(db, query);
      return { status: 200 as const, body: { items: [...items] } };
    },

    upsertByRef: async ({
      params,
      body,
    }: {
      params: { listId: number };
      body: {
        refKind: UpsertRefKind;
        refId: number;
        label: string;
        qty?: number | null;
        unit?: string | null;
        notes?: string | null;
        onConflict?: UpsertConflictMode;
      };
    }) => {
      try {
        const result = upsertItemByRef(db, { listId: params.listId, ...body });
        const status = result.outcome === 'inserted' ? (201 as const) : (200 as const);
        return { status, body: result };
      } catch (err) {
        const mapped = notFoundOrConflict(err);
        if (mapped?.kind === 'notFound') return { status: 404 as const, body: mapped.body };
        if (mapped?.kind === 'conflict') return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
    },

    add: async ({ params, body }: { params: { listId: number }; body: AddItemBody }) => {
      try {
        const row = addItem(db, { listId: params.listId, ...body });
        return { status: 201 as const, body: { id: row.id, position: row.position } };
      } catch (err) {
        const mapped = notFoundOrConflict(err);
        if (mapped?.kind === 'notFound') return { status: 404 as const, body: mapped.body };
        if (mapped?.kind === 'conflict') return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
    },

    bulkAdd: async ({
      params,
      body,
    }: {
      params: { listId: number };
      body: { items: AddItemBody[] };
    }) => {
      try {
        const rows = bulkAdd(db, params.listId, body.items);
        return { status: 201 as const, body: { addedIds: rows.map((r) => r.id) } };
      } catch (err) {
        const mapped = notFoundOrConflict(err);
        if (mapped?.kind === 'notFound') return { status: 404 as const, body: mapped.body };
        if (mapped?.kind === 'conflict') return { status: 400 as const, body: mapped.body };
        throw err as Error;
      }
    },

    update: async ({
      params,
      body,
    }: {
      params: { id: number };
      body: {
        label?: string;
        qty?: number | null;
        unit?: string | null;
        notes?: string | null;
      };
    }) => {
      try {
        updateItem(db, params.id, body);
        return { status: 200 as const, body: { ok: true as const } };
      } catch (err) {
        const mapped = notFoundOrConflict(err);
        if (mapped?.kind === 'notFound') return { status: 404 as const, body: mapped.body };
        throw err as Error;
      }
    },

    check: async ({ params }: { params: { id: number } }) => {
      try {
        const row = listItemsService.checkListItem(db, params.id);
        if (row.checkedAt === null) {
          throw new Error('check succeeded but checkedAt is null');
        }
        return {
          status: 200 as const,
          body: { ok: true as const, checkedAt: row.checkedAt },
        };
      } catch (err) {
        const mapped = notFoundOrConflict(err);
        if (mapped?.kind === 'notFound') return { status: 404 as const, body: mapped.body };
        throw err as Error;
      }
    },

    uncheck: async ({ params }: { params: { id: number } }) => {
      try {
        listItemsService.uncheckListItem(db, params.id);
        return { status: 200 as const, body: { ok: true as const } };
      } catch (err) {
        const mapped = notFoundOrConflict(err);
        if (mapped?.kind === 'notFound') return { status: 404 as const, body: mapped.body };
        throw err as Error;
      }
    },

    remove: async ({ params }: { params: { id: number } }) => {
      removeItem(db, params.id);
      return { status: 200 as const, body: { ok: true as const } };
    },

    reorder: async ({
      params,
      body,
    }: {
      params: { listId: number };
      body: { orderedIds: number[] };
    }) => {
      const current = listItemsService.listItemsForList(db, params.listId).map((r) => r.id);
      if (!isPermutationOfList(current, body.orderedIds)) {
        return {
          status: 200 as const,
          body: { ok: false as const, reason: 'BadIds' as const },
        };
      }
      reorderItems(db, params.listId, body.orderedIds);
      return { status: 200 as const, body: { ok: true as const } };
    },

    uncheckAll: async ({ params }: { params: { listId: number } }) => {
      const count = listItemsService.uncheckAllListItems(db, params.listId);
      return { status: 200 as const, body: { ok: true as const, count } };
    },

    removeChecked: async ({ params }: { params: { listId: number } }) => {
      const removedCount = removeCheckedItems(db, params.listId);
      return { status: 200 as const, body: { ok: true as const, removedCount } };
    },
  };
}
