/**
 * "Already sent" detection.
 *
 * Returns the ids of non-archived shopping lists whose item notes mention
 * the recipe title. The substring search + shopping/non-archived filter run
 * in the lists pillar (`GET /items?kind=shopping&notesContains=...`); this
 * just dedupes the list ids. Soft warning only — never blocks the send.
 */
import { type ListsClient } from './lists-client.js';

export async function findListsAlreadyMentioning(
  client: ListsClient,
  recipeTitle: string
): Promise<number[]> {
  if (recipeTitle.length === 0) return [];
  return client.searchShoppingListIdsByNotes(recipeTitle);
}
