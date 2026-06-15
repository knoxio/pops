/**
 * Apply `ResolverCreation[]` against the DB. Ingredients first, then variants
 * (variants reference parent ingredients by slug). Runs inside the compile
 * transaction.
 *
 * After creations land, the compile pipeline re-runs `resolveRecipeAst`
 * against the original AST — cleaner than rebinding ids on the existing
 * resolved blocks, since `slug_registry` now contains every new row.
 */
import { eq } from 'drizzle-orm';

import { slugRegistry } from '../db/schema.js';
import * as ingredientsService from '../db/services/ingredients.js';
import * as variantsService from '../db/services/variants.js';

import type { FoodDb } from '../db/services/internal.js';
import type { ResolverCreation } from './resolver-types.js';

const { createIngredient } = ingredientsService;
const { createVariant } = variantsService;

export function applyCreations(db: FoodDb, creations: readonly ResolverCreation[]): number {
  // Ingredients first so the variant lookups in the second pass can resolve
  // their parent slugs.
  for (const creation of creations) {
    if (creation.kind !== 'ingredient') continue;
    createIngredient(db, {
      slug: creation.slug,
      name: creation.slug,
      defaultUnit: creation.defaultUnit,
    });
  }
  for (const creation of creations) {
    if (creation.kind !== 'variant') continue;
    const parentId = lookupIngredientIdBySlug(db, creation.parentIngredientSlug);
    if (parentId === null) {
      throw new Error(
        `applyCreations: parent ingredient "${creation.parentIngredientSlug}" missing for variant "${creation.slug}"`
      );
    }
    createVariant(db, {
      ingredientId: parentId,
      slug: creation.slug,
      name: creation.slug,
      defaultUnit: creation.defaultUnit,
    });
  }
  return creations.length;
}

function lookupIngredientIdBySlug(db: FoodDb, slug: string): number | null {
  const rows = db
    .select({ kind: slugRegistry.kind, targetId: slugRegistry.targetId })
    .from(slugRegistry)
    .where(eq(slugRegistry.slug, slug))
    .all();
  const row = rows[0];
  if (row === undefined || row.kind !== 'ingredient') return null;
  return row.targetId;
}
