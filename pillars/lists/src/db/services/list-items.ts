/**
 * Service layer for the `list_items` table.
 *
 * Reads + check-state mutations (`listItemsForList`, `getListItem`,
 * `checkListItem`, `uncheckListItem`, `uncheckAllListItems`) plus the full
 * write surface (`addItem`, `bulkAdd`, `updateItem`, `removeItem`,
 * `reorderItems`, `removeCheckedItems`).
 *
 * `label` is the source of truth for display: callers compute it at insert
 * (denormalised from the source so a later rename of the ingredient doesn't
 * ghost-edit historical lists).
 *
 * `ref_id` is polymorphic — no FK enforcement at the schema level. When
 * `ref_kind != 'free'` but `ref_id IS NULL`, `normalise()` falls back to
 * `'free'` per PRD-112 Edge Cases.
 */
import { and, asc, eq } from 'drizzle-orm';

import { ListItemNotFoundError } from '../errors.js';
import { listItems, type ListItemRefKind, type ListItemRow } from '../schema.js';
import { expectRow, type ListsDb, nextPosition, nowIso } from './internal.js';

/* ---------- reads ---------- */

/**
 * Return every list-item row for a given list, ordered by `position` then
 * `id` so display is stable across reorder edge cases.
 */
export function listItemsForList(db: ListsDb, listId: number): readonly ListItemRow[] {
  return db
    .select()
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.position), asc(listItems.id))
    .all();
}

/**
 * Return a single list-item row by primary key.
 * Throws `ListItemNotFoundError` when no row matches.
 */
export function getListItem(db: ListsDb, itemId: number): ListItemRow {
  const row = db.select().from(listItems).where(eq(listItems.id, itemId)).get();
  if (row === undefined) {
    throw new ListItemNotFoundError(itemId);
  }
  return row;
}

/* ---------- check-state mutations ---------- */

/**
 * Flip a single list-item to `checked=1` and stamp `checked_at`. Re-checking
 * an already-checked row refreshes the timestamp.
 * Throws `ListItemNotFoundError` when the id is unknown.
 */
export function checkListItem(db: ListsDb, itemId: number): ListItemRow {
  const rows = db
    .update(listItems)
    .set({ checked: 1, checkedAt: nowIso() })
    .where(eq(listItems.id, itemId))
    .returning()
    .all();
  if (rows.length === 0) {
    throw new ListItemNotFoundError(itemId);
  }
  return expectRow(rows, `checkListItem(${itemId})`);
}

/**
 * Clear `checked` + `checked_at` on a single list-item. Idempotent.
 * Throws `ListItemNotFoundError` when the id is unknown.
 */
export function uncheckListItem(db: ListsDb, itemId: number): ListItemRow {
  const rows = db
    .update(listItems)
    .set({ checked: 0, checkedAt: null })
    .where(eq(listItems.id, itemId))
    .returning()
    .all();
  if (rows.length === 0) {
    throw new ListItemNotFoundError(itemId);
  }
  return expectRow(rows, `uncheckListItem(${itemId})`);
}

/**
 * Bulk-uncheck every currently-checked item in a list (PRD-141 amendment).
 * Single UPDATE inside a transaction. Returns the row count affected.
 */
export function uncheckAllListItems(db: ListsDb, listId: number): number {
  return db.transaction((tx) => {
    const rows = tx
      .update(listItems)
      .set({ checked: 0, checkedAt: null })
      .where(and(eq(listItems.listId, listId), eq(listItems.checked, 1)))
      .returning({ id: listItems.id })
      .all();
    return rows.length;
  });
}

/* ---------- write surface ---------- */

export interface AddItemInput {
  listId: number;
  label: string;
  qty?: number | null;
  unit?: string | null;
  refKind?: ListItemRefKind;
  refId?: number | null;
  position?: number;
  dueAt?: string | null;
  notes?: string | null;
}

interface NormalisedItemValues {
  listId: number;
  label: string;
  qty: number | null;
  unit: string | null;
  refKind: ListItemRefKind;
  refId: number | null;
  position: number;
  dueAt: string | null;
  notes: string | null;
}

function normalise(input: AddItemInput, fallbackPosition: number): NormalisedItemValues {
  const refKind: ListItemRefKind = input.refKind ?? 'free';
  const refId = input.refId ?? null;
  const effectiveKind: ListItemRefKind = refKind !== 'free' && refId === null ? 'free' : refKind;
  return {
    listId: input.listId,
    label: input.label,
    qty: input.qty ?? null,
    unit: input.unit ?? null,
    refKind: effectiveKind,
    refId: effectiveKind === 'free' ? null : refId,
    position: input.position ?? fallbackPosition,
    dueAt: input.dueAt ?? null,
    notes: input.notes ?? null,
  };
}

export function addItem(db: ListsDb, input: AddItemInput): ListItemRow {
  return db.transaction((tx) => {
    const fallback = input.position ?? nextPosition(tx, input.listId);
    const values = normalise(input, fallback);
    const rows = tx.insert(listItems).values(values).returning().all();
    return expectRow(rows, 'addItem');
  });
}

/**
 * Insert N items in a single transaction. Returned rows preserve input order.
 */
export function bulkAdd(
  db: ListsDb,
  listId: number,
  items: readonly Omit<AddItemInput, 'listId'>[]
): readonly ListItemRow[] {
  if (items.length === 0) return [];
  return db.transaction((tx) => {
    const start = nextPosition(tx, listId);
    const out: ListItemRow[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item === undefined) continue;
      const fallback = item.position ?? start + i;
      const values = normalise({ ...item, listId }, fallback);
      const rows = tx.insert(listItems).values(values).returning().all();
      out.push(expectRow(rows, `bulkAdd[${i}]`));
    }
    return out;
  });
}

export interface UpdateItemInput {
  label?: string;
  qty?: number | null;
  unit?: string | null;
  notes?: string | null;
  dueAt?: string | null;
  position?: number;
}

export function updateItem(db: ListsDb, itemId: number, input: UpdateItemInput): ListItemRow {
  const patch: Partial<UpdateItemInput> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.qty !== undefined) patch.qty = input.qty;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
  if (input.position !== undefined) patch.position = input.position;
  if (Object.keys(patch).length === 0) {
    const current = db.select().from(listItems).where(eq(listItems.id, itemId)).all()[0];
    if (current === undefined) throw new ListItemNotFoundError(itemId);
    return current;
  }
  const rows = db.update(listItems).set(patch).where(eq(listItems.id, itemId)).returning().all();
  if (rows.length === 0) throw new ListItemNotFoundError(itemId);
  return expectRow(rows, `updateItem(${itemId})`);
}

export function removeItem(db: ListsDb, itemId: number): void {
  db.delete(listItems).where(eq(listItems.id, itemId)).run();
}

/**
 * Reorder items within a list. Caller passes the item ids in their desired
 * order; the service writes monotonic `position` values starting at zero.
 * Items not in the input list are left alone.
 */
export function reorderItems(db: ListsDb, listId: number, orderedItemIds: readonly number[]): void {
  if (orderedItemIds.length === 0) return;
  db.transaction((tx) => {
    for (let i = 0; i < orderedItemIds.length; i += 1) {
      const id = orderedItemIds[i];
      if (id === undefined) continue;
      tx.update(listItems)
        .set({ position: i })
        .where(and(eq(listItems.id, id), eq(listItems.listId, listId)))
        .run();
    }
  });
}

/**
 * Hard-delete every currently-checked item in a list (PRD-141 amendment).
 * Returns the row count removed.
 */
export function removeCheckedItems(db: ListsDb, listId: number): number {
  return db.transaction((tx) => {
    const rows = tx
      .delete(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.checked, 1)))
      .returning({ id: listItems.id })
      .all();
    return rows.length;
  });
}
