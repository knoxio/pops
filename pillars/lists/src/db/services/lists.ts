/**
 * List services.
 *
 * Pure functions over a drizzle handle. Each takes a `ListsDb` (top-level db
 * or a transaction handle) so callers can compose mutations atomically.
 *
 * Schema invariants:
 *   - `kind` is checked at the SQLite level (CHECK constraint); the typed
 *     `ListKind` union mirrors it so TS callers can't slip through.
 *   - `deleteList` removes child `list_items` first (no FK CASCADE).
 *   - `archiveList` is the normal "soft-delete" path; hard delete is rare.
 */
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { ListNotFoundError } from '../errors.js';
import { listItems, lists, type ListKind, type ListRow } from '../schema.js';
import { expectRow, type ListsDb, nowIso } from './internal.js';

export type { ListsDb } from './internal.js';

export interface CreateListInput {
  name: string;
  kind: ListKind;
  ownerApp: string;
}

export function createList(db: ListsDb, input: CreateListInput): ListRow {
  const rows = db
    .insert(lists)
    .values({
      name: input.name,
      kind: input.kind,
      ownerApp: input.ownerApp,
    })
    .returning()
    .all();
  return expectRow(rows, 'createList');
}

export function getList(db: ListsDb, listId: number): ListRow | null {
  const rows = db.select().from(lists).where(eq(lists.id, listId)).all();
  return rows[0] ?? null;
}

export interface ListListsFilter {
  kind?: ListKind;
  ownerApp?: string;
  /** Default `false` — archived lists are hidden unless explicitly requested. */
  includeArchived?: boolean;
}

export function listLists(db: ListsDb, filter: ListListsFilter = {}): readonly ListRow[] {
  const conditions = [
    filter.kind === undefined ? undefined : eq(lists.kind, filter.kind),
    filter.ownerApp === undefined ? undefined : eq(lists.ownerApp, filter.ownerApp),
    filter.includeArchived === true ? undefined : isNull(lists.archivedAt),
  ].filter((c): c is Exclude<typeof c, undefined> => c !== undefined);

  const where = conditions.length === 0 ? undefined : and(...conditions);
  const baseQuery = db.select().from(lists);
  const rows =
    where === undefined
      ? baseQuery.orderBy(desc(lists.createdAt)).all()
      : baseQuery.where(where).orderBy(desc(lists.createdAt)).all();
  return rows;
}

export function archiveList(db: ListsDb, listId: number): ListRow {
  return db.transaction((tx) => {
    const existing = getList(tx, listId);
    if (existing === null) throw new ListNotFoundError(listId);
    // Archiving an already-archived list updates `archived_at` to the new
    // timestamp (idempotent at the row level, not at the timestamp level).
    // The UI debounces; the service is the safe path for any caller that wants
    // the canonical "I archived this just now" wall-clock.
    // See pillars/lists/docs/prds/crud-ui Edge Cases.
    const rows = tx
      .update(lists)
      .set({ archivedAt: nowIso() })
      .where(eq(lists.id, listId))
      .returning()
      .all();
    return expectRow(rows, `archiveList(${listId})`);
  });
}

export function unarchiveList(db: ListsDb, listId: number): ListRow {
  return db.transaction((tx) => {
    const existing = getList(tx, listId);
    if (existing === null) throw new ListNotFoundError(listId);
    if (existing.archivedAt === null) return existing;
    const rows = tx
      .update(lists)
      .set({ archivedAt: null })
      .where(and(eq(lists.id, listId), isNotNull(lists.archivedAt)))
      .returning()
      .all();
    return expectRow(rows, `unarchiveList(${listId})`);
  });
}

/**
 * Hard-delete a list and every child item in one transaction.
 *
 * There is no FK CASCADE on `list_items.list_id`; the service is the safe
 * write path. Calling `deleteList` on an unknown id is a no-op (delete is
 * idempotent — see pillars/lists/docs/prds/crud-ui Edge Cases).
 */
export function deleteList(db: ListsDb, listId: number): void {
  db.transaction((tx) => {
    tx.delete(listItems).where(eq(listItems.listId, listId)).run();
    tx.delete(lists).where(eq(lists.id, listId)).run();
  });
}

export interface UpdateListInput {
  name?: string;
  kind?: ListKind;
}

/**
 * Update mutable fields on a list (name, kind) so the lists UI can rename and
 * change kind. An empty patch returns the current row unchanged.
 */
export function updateList(db: ListsDb, listId: number, input: UpdateListInput): ListRow {
  const patch: Partial<{ name: string; kind: ListKind }> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (Object.keys(patch).length === 0) {
    const current = getList(db, listId);
    if (current === null) throw new ListNotFoundError(listId);
    return current;
  }
  const rows = db.update(lists).set(patch).where(eq(lists.id, listId)).returning().all();
  if (rows.length === 0) throw new ListNotFoundError(listId);
  return expectRow(rows, `updateList(${listId})`);
}
