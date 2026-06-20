/**
 * PRD-113 seed step — ingredients + variants.
 *
 * Walks the (parent → children) tree and inserts each ingredient via
 * `createIngredient`, then `createVariant` per variant. Per-ingredient
 * shelf-life defaults propagate to variants unless the variant overrides.
 *
 * Returns `{ ingredients, variants }` counts so the orchestrator can roll
 * them into the SeedSummary.
 */
import { createIngredient } from '../db/services/ingredients.js';
import { createVariant } from '../db/services/variants.js';
import { INGREDIENT_FIXTURES_PRODUCE_AND_BREAD } from './data-ingredients-produce.js';
import { INGREDIENT_FIXTURES_PROTEIN } from './data-ingredients-protein.js';
import { INGREDIENT_FIXTURES_PANTRY_AND_DAIRY } from './data-ingredients.js';

import type { FoodDb } from '../db/services/internal.js';
import type { IngredientFixture, VariantFixture } from './types-ingredient.js';
import type { SeedContext } from './types.js';

const ALL_INGREDIENT_GROUPS: readonly (readonly IngredientFixture[])[] = [
  INGREDIENT_FIXTURES_PANTRY_AND_DAIRY,
  INGREDIENT_FIXTURES_PRODUCE_AND_BREAD,
  INGREDIENT_FIXTURES_PROTEIN,
];

function variantKey(ingredientSlug: string, variantSlug: string): string {
  return `${ingredientSlug}:${variantSlug}`;
}

function pickShelfLife(
  parent: IngredientFixture,
  variant: VariantFixture
): { fridge: number | null; freezer: number | null } {
  // Variant explicit overrides win; otherwise inherit from ingredient defaults.
  const fridge =
    variant.shelfLifeDaysFridge !== undefined
      ? variant.shelfLifeDaysFridge
      : (parent.shelfLifeDaysFridge ?? null);
  const freezer =
    variant.shelfLifeDaysFreezer !== undefined
      ? variant.shelfLifeDaysFreezer
      : (parent.shelfLifeDaysFreezer ?? null);
  return { fridge, freezer };
}

function seedVariantsFor(
  db: FoodDb,
  parent: IngredientFixture,
  parentId: number,
  ctx: SeedContext
): number {
  for (const variant of parent.variants) {
    const shelf = pickShelfLife(parent, variant);
    const row = createVariant(db, {
      ingredientId: parentId,
      name: variant.name,
      slug: variant.slug,
      defaultUnit: variant.defaultUnit ?? parent.defaultUnit,
      packageSizeG: variant.packageSizeG ?? null,
      notes: variant.notes ?? null,
      defaultShelfLifeDaysFridge: shelf.fridge,
      defaultShelfLifeDaysFreezer: shelf.freezer,
    });
    ctx.variantIdByCompositeSlug.set(variantKey(parent.slug, variant.slug), row.id);
  }
  return parent.variants.length;
}

interface SeedTreeArgs {
  fixture: IngredientFixture;
  parentId: number | null;
  counts: { ingredients: number; variants: number };
}

function seedTree(db: FoodDb, ctx: SeedContext, args: SeedTreeArgs): void {
  const { fixture, parentId, counts } = args;
  const row = createIngredient(db, {
    name: fixture.name,
    slug: fixture.slug,
    defaultUnit: fixture.defaultUnit,
    parentId,
    densityGPerMl: fixture.densityGPerMl ?? null,
    notes: fixture.notes ?? null,
  });
  ctx.ingredientIdBySlug.set(row.slug, row.id);
  counts.ingredients += 1;
  counts.variants += seedVariantsFor(db, fixture, row.id, ctx);

  if (fixture.children !== undefined) {
    for (const child of fixture.children) {
      seedTree(db, ctx, { fixture: child, parentId: row.id, counts });
    }
  }
}

export function seedIngredientsAndVariants(
  db: FoodDb,
  ctx: SeedContext
): { ingredients: number; variants: number } {
  const counts = { ingredients: 0, variants: 0 };
  for (const group of ALL_INGREDIENT_GROUPS) {
    for (const fixture of group) {
      seedTree(db, ctx, { fixture, parentId: null, counts });
    }
  }
  return counts;
}
