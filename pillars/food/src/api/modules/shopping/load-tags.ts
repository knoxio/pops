/**
 * Bulk-load `store-section:*` and other tags for every ingredient that
 * appears in the need set. Single query, indexed by `ingredient_tags.tag`
 * via the `idx_ingredient_tags_namespace` expression index for the
 * `store-section:` prefix.
 *
 * Returns a map keyed by `ingredient_id` so the sectioner can look up each
 * ingredient's full tag list in O(1).
 */
import { inArray } from 'drizzle-orm';

import { type FoodDb, ingredientTags } from '../../../db/index.js';

export function loadTagsForIngredients(
  db: FoodDb,
  ingredientIds: readonly number[]
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (ingredientIds.length === 0) return map;
  const rows = db
    .select({ ingredientId: ingredientTags.ingredientId, tag: ingredientTags.tag })
    .from(ingredientTags)
    .where(inArray(ingredientTags.ingredientId, [...ingredientIds]))
    .all();
  for (const r of rows) {
    const list = map.get(r.ingredientId);
    if (list === undefined) map.set(r.ingredientId, [r.tag]);
    else list.push(r.tag);
  }
  return map;
}
