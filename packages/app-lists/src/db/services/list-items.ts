/**
 * List-item services — PRD-112.
 *
 * Item-level CRUD plus the `bulkAdd` transactional path consumed by Epic 04's
 * "send recipe to shopping list" action. Label is the source of truth for
 * display: callers compute it at insert (denormalised from the source so a
 * later rename of the ingredient doesn't ghost-edit historical lists).
 *
 * `ref_id` is polymorphic — no FK enforcement. When `ref_kind='ingredient'`
 * but `ref_id IS NULL`, the v1 behaviour per the PRD's Edge Cases table is
 * to treat it as `'free'` (the column accepts it; the service normalises).
 */
import { and, asc, eq } from 'drizzle-orm';

import { ListItemNotFoundError } from '../errors';
import { listItems, type ListItemRefKind, type ListItemRow } from '../schema';
import { expectRow, type ListsDb, nowIso } from './internal';

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
  // PRD edge case: ref_kind != 'free' with ref_id === null falls back to 'free'.
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

function nextPosition(db: ListsDb, listId: number): number {
  const rows = db
    .select({ position: listItems.position })
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.position))
    .all();
  if (rows.length === 0) return 0;
  let max = 0;
  for (const row of rows) {
    if (row.position > max) max = row.position;
  }
  return max + 1;
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
 * Insert N items in a single transaction. One round-trip; service-layer
 * sequential `INSERT` statements (no DRIVER-side parameter expansion) so
 * the returned ids stay in input order.
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

export function checkItem(db: ListsDb, itemId: number): ListItemRow {
  const rows = db
    .update(listItems)
    .set({ checked: 1, checkedAt: nowIso() })
    .where(eq(listItems.id, itemId))
    .returning()
    .all();
  if (rows.length === 0) throw new ListItemNotFoundError(itemId);
  return expectRow(rows, `checkItem(${itemId})`);
}

export function uncheckItem(db: ListsDb, itemId: number): ListItemRow {
  const rows = db
    .update(listItems)
    .set({ checked: 0, checkedAt: null })
    .where(eq(listItems.id, itemId))
    .returning()
    .all();
  if (rows.length === 0) throw new ListItemNotFoundError(itemId);
  return expectRow(rows, `uncheckItem(${itemId})`);
}

/**
 * Reorder items within a list. Caller passes the item ids in their desired
 * order; the service writes monotonic `position` values starting at zero.
 * Items not in the input list are left alone (positions become non-contiguous
 * but UI sorts by position then id, so display stays stable).
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

export function listItemsForList(db: ListsDb, listId: number): readonly ListItemRow[] {
  return db
    .select()
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.position), asc(listItems.id))
    .all();
}
