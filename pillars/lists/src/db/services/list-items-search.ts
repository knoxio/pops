/**
 * Generic items search across lists.
 *
 * Filters compose; no filter ⇒ returns every item in the database (callers
 * should pass at least one). `labelContains` / `notesContains` use SQLite's
 * case-insensitive LIKE on ASCII text. `%`, `_`, and `\` in the input are
 * escaped server-side; the LIKE clause uses `'\'` as the ESCAPE character.
 *
 * `includeArchived` defaults to false — archived lists' items are hidden
 * unless the caller opts in.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { listItems, lists, type ListItemRow, type ListKind } from '../schema.js';
import { type ListsDb } from './internal.js';

export interface SearchListItemsFilter {
  kind?: ListKind;
  listId?: number;
  includeArchived?: boolean;
  labelContains?: string;
  notesContains?: string;
}

function escapeLikePattern(input: string): string {
  return input.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export function searchListItems(
  db: ListsDb,
  filter: SearchListItemsFilter = {}
): readonly ListItemRow[] {
  const needsJoin = filter.kind !== undefined || filter.includeArchived !== true;

  const conditions = [
    filter.listId === undefined ? undefined : eq(listItems.listId, filter.listId),
    filter.kind === undefined ? undefined : eq(lists.kind, filter.kind),
    filter.includeArchived === true ? undefined : isNull(lists.archivedAt),
    filter.labelContains === undefined
      ? undefined
      : sql`${listItems.label} LIKE ${`%${escapeLikePattern(filter.labelContains)}%`} ESCAPE '\\'`,
    filter.notesContains === undefined
      ? undefined
      : sql`${listItems.notes} LIKE ${`%${escapeLikePattern(filter.notesContains)}%`} ESCAPE '\\'`,
  ].filter((c): c is Exclude<typeof c, undefined> => c !== undefined);

  const where = conditions.length === 0 ? undefined : and(...conditions);
  const baseSelect = db.select({ item: listItems }).from(listItems);
  const joined = needsJoin
    ? baseSelect.innerJoin(lists, eq(lists.id, listItems.listId))
    : baseSelect;
  const rows =
    where === undefined
      ? joined.orderBy(asc(listItems.listId), asc(listItems.position), asc(listItems.id)).all()
      : joined
          .where(where)
          .orderBy(asc(listItems.listId), asc(listItems.position), asc(listItems.id))
          .all();
  return rows.map((r) => r.item);
}
