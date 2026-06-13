/**
 * "Already sent" detection for PRD-142.
 *
 * Returns the IDs of non-archived shopping lists whose `list_items.notes`
 * contain the recipe title (case-insensitive — SQLite LIKE default for
 * ASCII). `%` and `_` in the title are escaped server-side; the LIKE
 * clause uses `'\\'` as the ESCAPE character.
 *
 * Soft warning only — never blocks the send.
 */
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { type ListsDb, listItems, lists } from '@pops/app-lists-db';

import { escapeLike } from './notes-helpers.js';

export function findListsAlreadyMentioning(db: ListsDb, recipeTitle: string): number[] {
  if (recipeTitle.length === 0) return [];
  const pattern = `%${escapeLike(recipeTitle)}%`;
  const rows = db
    .selectDistinct({ listId: listItems.listId })
    .from(listItems)
    .innerJoin(lists, eq(lists.id, listItems.listId))
    .where(
      and(
        eq(lists.kind, 'shopping'),
        isNull(lists.archivedAt),
        isNotNull(listItems.notes),
        sql`${listItems.notes} LIKE ${pattern} ESCAPE '\\'`
      )
    )
    .all();
  return rows.map((r) => r.listId).toSorted((a, b) => a - b);
}
