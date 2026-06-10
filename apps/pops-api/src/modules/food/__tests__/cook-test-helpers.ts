/**
 * Shared cook-test fixtures used by `cook-router.test.ts` (PRD-144) and
 * `cook-overrides.test.ts` (PRD-146 deferred slice).
 *
 * `createFoodTestDb` lives in `cook-test-db.ts` to keep this file under
 * the 200-line cap.
 */
import { eq } from 'drizzle-orm';

import {
  batches,
  ingredientsService,
  ingredientVariants,
  recipeLines,
  recipesService,
  recipeVersions,
  variantsService,
} from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';

export { createFoodTestDb } from './cook-test-db.js';

export interface SeededRecipe {
  recipeId: number;
  versionId: number;
  ingredientId: number;
  variantId: number;
  yieldIngredientId: number;
  yieldVariantId: number;
}

function seedTomatoVariant(slug: string): { ingredientId: number; variantId: number } {
  const db = getDrizzle();
  const ing = ingredientsService.createIngredient(db, {
    name: 'Tomato',
    slug: `${slug}-tomato`,
    defaultUnit: 'g',
  });
  const variant = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: 'Diced',
    slug: `${slug}-diced`,
    defaultUnit: 'g',
  });
  db.update(ingredientVariants)
    .set({ defaultShelfLifeDaysFridge: 5, defaultShelfLifeDaysFreezer: 90 })
    .where(eq(ingredientVariants.id, variant.id))
    .run();
  return { ingredientId: ing.id, variantId: variant.id };
}

function seedYieldVariant(slug: string): { ingredientId: number; variantId: number } {
  const db = getDrizzle();
  const yieldIng = ingredientsService.createIngredient(db, {
    name: 'Sauce',
    slug: `${slug}-sauce`,
    defaultUnit: 'g',
  });
  const yieldVar = variantsService.createVariant(db, {
    ingredientId: yieldIng.id,
    name: 'Default',
    slug: `${slug}-sauce-default`,
    defaultUnit: 'g',
  });
  db.update(ingredientVariants)
    .set({ defaultShelfLifeDaysFridge: 3, defaultShelfLifeDaysFreezer: 60 })
    .where(eq(ingredientVariants.id, yieldVar.id))
    .run();
  return { ingredientId: yieldIng.id, variantId: yieldVar.id };
}

interface YieldShape {
  ingredientId: number;
  variantId: number;
}

function finaliseRecipeVersion(versionId: number, yieldShape: YieldShape | null): void {
  const yields = yieldShape !== null;
  getDrizzle()
    .update(recipeVersions)
    .set({
      compileStatus: 'compiled',
      compiledAt: new Date().toISOString(),
      servings: 4,
      yieldIngredientId: yields ? yieldShape.ingredientId : null,
      yieldVariantId: yields ? yieldShape.variantId : null,
      yieldQty: yields ? 800 : null,
      yieldUnit: yields ? 'g' : null,
    })
    .where(eq(recipeVersions.id, versionId))
    .run();
}

export function seedCompiledRecipe(slug: string, opts: { yields?: boolean } = {}): SeededRecipe {
  const db = getDrizzle();
  const yields = opts.yields ?? true;
  const tomato = seedTomatoVariant(slug);
  const yieldShape = yields ? seedYieldVariant(slug) : tomato;
  const { version } = recipesService.createRecipe(db, {
    slug,
    firstVersion: { title: `Test ${slug}`, bodyDsl: `@recipe(slug="${slug}", title="Test")` },
  });
  finaliseRecipeVersion(version.id, yields ? yieldShape : null);
  seedRecipeLine({
    versionId: version.id,
    position: 1,
    variantId: tomato.variantId,
    ingredientId: tomato.ingredientId,
    qtyG: 200,
  });
  return {
    recipeId: version.recipeId,
    versionId: version.id,
    ingredientId: tomato.ingredientId,
    variantId: tomato.variantId,
    yieldIngredientId: yieldShape.ingredientId,
    yieldVariantId: yieldShape.variantId,
  };
}

export interface ExtraLineArgs {
  versionId: number;
  position: number;
  ingredientId: number;
  variantId: number;
  qtyG: number;
  optional?: boolean;
}

export function seedRecipeLine(args: ExtraLineArgs): void {
  getDrizzle()
    .insert(recipeLines)
    .values({
      recipeVersionId: args.versionId,
      position: args.position,
      ingredientId: args.ingredientId,
      variantId: args.variantId,
      prepStateId: null,
      isRecipeRef: 0,
      recipeRefId: null,
      originalText: `line-${args.position}`,
      originalQty: args.qtyG,
      originalUnit: 'g',
      qtyG: args.qtyG,
      qtyMl: null,
      qtyCount: null,
      canonicalUnit: 'g',
      optional: args.optional === true ? 1 : 0,
      notes: null,
    })
    .run();
}

export function seedBatch(variantId: number, qty: number): number {
  const rows = getDrizzle()
    .insert(batches)
    .values({
      variantId,
      prepStateId: null,
      qtyRemaining: qty,
      unit: 'g',
      sourceType: 'purchase',
      sourceId: null,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: null,
      notes: null,
    })
    .returning()
    .all();
  const row = rows[0];
  if (row === undefined) throw new Error('seedBatch failed');
  return row.id;
}

export interface ExtraIngredientLineArgs {
  slug: string;
  versionId: number;
  position: number;
  qtyG: number;
  optional?: boolean;
}

export function seedExtraIngredientLine(args: ExtraIngredientLineArgs): number {
  const db = getDrizzle();
  const ing = ingredientsService.createIngredient(db, {
    name: `Extra ${args.slug}`,
    slug: `${args.slug}-extra-${args.position}`,
    defaultUnit: 'g',
  });
  const variant = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: 'Default',
    slug: `${args.slug}-extra-${args.position}-default`,
    defaultUnit: 'g',
  });
  seedRecipeLine({
    versionId: args.versionId,
    position: args.position,
    ingredientId: ing.id,
    variantId: variant.id,
    qtyG: args.qtyG,
    optional: args.optional,
  });
  return variant.id;
}
