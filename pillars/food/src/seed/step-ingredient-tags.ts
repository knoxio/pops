/**
 * Seed step — apply `store-section:*` tags to the seeded ingredients. Runs
 * after `seedIngredientsAndVariants` so the slug→id map is populated.
 *
 * Only sections with seeded ingredients are seeded (produce, dairy, meat,
 * pantry). Sections like `frozen` or `bakery` populate as the user tags
 * their own library — keeping the seed sparse stops the vocabulary tab
 * from misleading users about what's pre-curated.
 *
 * Ingredient slugs that don't appear in the seed (e.g. when a future
 * fixture file drops one) are silently skipped — the seed shouldn't fail
 * because the ingredient list was reshuffled.
 */
import { addTagToIngredient } from '../db/services/ingredient-tags.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

/**
 * `ingredient_slug → tag[]` covering the seeded fixture set. Each tag is the
 * canonical `store-section:<slug>` value the shopping-list generator groups on.
 *
 * Convention follows aisle layout, not taxonomy: eggs sit with dairy.
 */
const SEEDED_TAGS: Record<string, readonly string[]> = {
  // PRODUCE
  onion: ['store-section:produce'],
  garlic: ['store-section:produce'],
  tomato: ['store-section:produce'],
  'roma-tomato': ['store-section:produce'],
  'cherry-tomato': ['store-section:produce'],
  potato: ['store-section:produce'],
  'desiree-potato': ['store-section:produce'],
  carrot: ['store-section:produce'],
  lemon: ['store-section:produce'],
  corn: ['store-section:produce'],
  parsley: ['store-section:produce'],
  // DAIRY (eggs included per supermarket convention)
  butter: ['store-section:dairy'],
  milk: ['store-section:dairy'],
  egg: ['store-section:dairy'],
  cheese: ['store-section:dairy'],
  // MEAT
  chicken: ['store-section:meat'],
  beef: ['store-section:meat'],
  // PANTRY
  flour: ['store-section:pantry'],
  salt: ['store-section:pantry'],
  pepper: ['store-section:pantry'],
  sugar: ['store-section:pantry'],
  'olive-oil': ['store-section:pantry'],
  // BAKERY
  bread: ['store-section:bakery'],
};

export function seedIngredientTags(db: FoodDb, ctx: SeedContext): number {
  let inserted = 0;
  for (const [slug, tags] of Object.entries(SEEDED_TAGS)) {
    const ingredientId = ctx.ingredientIdBySlug.get(slug);
    if (ingredientId === undefined) continue;
    for (const tag of tags) {
      const result = addTagToIngredient(db, ingredientId, tag);
      if (result.ok) inserted += 1;
    }
  }
  return inserted;
}
