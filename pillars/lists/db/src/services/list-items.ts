/**
 * Read + check-state services for the `list_items` table.
 *
 * Phase 1 PR 1 ships two reads (list / get) and three check-state mutations
 * (check / uncheck / bulk-uncheck). The create / update / remove / bulk-add
 * / reorder surface stays in `@pops/app-lists-db` for now because it pulls
 * in the position-allocation transaction helpers and the ref-kind
 * normalisation logic that haven't been audited for the new package
 * boundary yet. The next slice PR widens this surface once the helpers
 * move across.
 *
 * `ref_id` is polymorphic — no FK enforcement at the schema level. Callers
 * that need cross-table validation do it in the router (mirrors how the
 * existing `@pops/app-lists-db` callers work).
 */
import { and, asc, eq } from 'drizzle-orm';

import { ListItemNotFoundError } from '../errors.js';
import { listItems, type ListItemRow } from '../schema.js';
import { expectRow, type ListsDb, nowIso } from './internal.js';

/**
 * Return every list-item row for a given list, ordered by `position` then
 * `id` so display is stable across reorder edge cases (two rows sharing a
 * position fall back to insertion order).
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
 * Return a single list-item row by primary key. Throws
 * `ListItemNotFoundError` when no row matches — callers in the router layer
 * map the typed error onto the appropriate tRPC code.
 */
export function getListItem(db: ListsDb, itemId: number): ListItemRow {
  const row = db.select().from(listItems).where(eq(listItems.id, itemId)).get();
  if (row === undefined) {
    throw new ListItemNotFoundError(itemId);
  }
  return row;
}

/**
 * Flip a single list-item to `checked=1` and stamp `checked_at`. Re-checking
 * an already-checked row refreshes the timestamp (idempotent at the row
 * level, not at the timestamp level — matches PRD-141 semantics).
 *
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
 * Clear `checked` + `checked_at` on a single list-item. Idempotent — un-
 * checking an already-unchecked row is a no-op write (drizzle still emits
 * the UPDATE but the resulting row is identical).
 *
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
 *
 * Single UPDATE inside a transaction. Returns the row count affected so the
 * UI can show "Unchecked N items" without a follow-up read. No-op (returns
 * 0) when nothing was checked.
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
