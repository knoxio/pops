/**
 * PRD-149 — integration tests for `food.substitutions.resolveForLine`.
 *
 * Reuses the same migration-replay pattern as `solver.test.ts` (PRD-150)
 * so the resolver runs against the real schema. Pins:
 *
 *  - Happy path: a line with one matching global sub returns the candidate
 *    with the right batches and ratio.
 *  - No subs available: returns an empty `candidates` array.
 *  - Context-tag OR-overlap: a tagged sub on a tagged recipe surfaces;
 *    tagged sub on an untagged recipe does NOT (the OR-overlap rule).
 *  - Recipe-scoped (from, to) pair override: the recipe-scoped row wins
 *    while other global edges out of the same `from` survive.
 *  - Ingredient-level `to` side: fans out across every variant of the
 *    target ingredient.
 *  - LineNotFound when the line index is missing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ingredientsService,
  recipeLines,
  recipes,
  recipesService,
  recipeTags,
  recipeVersions,
  substitutionsService,
  variantsService,
} from '@pops/app-food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0061_shocking_skreet.sql',
  '0062_chemical_donald_blake.sql',
  '0063_bumpy_wolverine.sql',
  '0064_peaceful_magma.sql',
  '0065_prd_116_recipe_compile.sql',
  '0066_prd_123_conversions.sql',
  '0067_prd_125_ingest_error_columns.sql',
  '0068_prd_136_inbox_review.sql',
  '0069_prd_145_batches_deleted_at.sql',
];

function applyMigration(db: Database, filename: string): void {
  const text = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of text.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

function createFoodTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATION_FILES) applyMigration(db, name);
  return db;
}

interface VariantHandle {
  ingredientId: number;
  variantId: number;
}

function makeIngredientWithVariant(
  slug: string,
  variantSlug: string,
  defaultUnit: 'g' | 'ml' | 'count' = 'g'
): VariantHandle {
  const db = getDrizzle();
  const ing = ingredientsService.createIngredient(db, { name: slug, slug, defaultUnit });
  const variant = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: variantSlug,
    slug: variantSlug,
    defaultUnit,
  });
  return { ingredientId: ing.id, variantId: variant.id };
}

function makeVariant(ingredientId: number, slug: string): number {
  const db = getDrizzle();
  return variantsService.createVariant(db, {
    ingredientId,
    name: slug,
    slug,
    defaultUnit: 'g',
  }).id;
}

interface RecipeHandle {
  recipeId: number;
  recipeVersionId: number;
}

function makeCompiledRecipe(slug: string, opts: { tags?: readonly string[] } = {}): RecipeHandle {
  const db = getDrizzle();
  const { recipe, version } = recipesService.createRecipe(db, {
    slug,
    firstVersion: { title: slug, bodyDsl: `@recipe(slug="${slug}", title="${slug}")` },
  });
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled' })
    .where(eq(recipeVersions.id, version.id))
    .run();
  db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipe.id)).run();
  if (opts.tags !== undefined) {
    for (const tag of opts.tags) {
      db.insert(recipeTags).values({ recipeId: recipe.id, tag }).run();
    }
  }
  return { recipeId: recipe.id, recipeVersionId: version.id };
}

interface AddLineInput {
  position: number;
  ingredientId: number;
  variantId: number;
  qtyG?: number;
  qtyMl?: number;
  qtyCount?: number;
  canonicalUnit: 'g' | 'ml' | 'count';
}

function addLine(recipeVersionId: number, line: AddLineInput): void {
  const db = getDrizzle();
  db.insert(recipeLines)
    .values({
      recipeVersionId,
      position: line.position,
      ingredientId: line.ingredientId,
      variantId: line.variantId,
      prepStateId: null,
      isRecipeRef: 0,
      recipeRefId: null,
      originalText: 'seeded',
      originalQty: line.qtyG ?? line.qtyMl ?? line.qtyCount ?? 0,
      originalUnit: line.canonicalUnit,
      qtyG: line.qtyG ?? null,
      qtyMl: line.qtyMl ?? null,
      qtyCount: line.qtyCount ?? null,
      canonicalUnit: line.canonicalUnit,
      optional: 0,
      notes: null,
    })
    .run();
}

async function addBatch(
  caller: ReturnType<typeof createCaller>,
  variantId: number,
  qty: number
): Promise<void> {
  await caller.food.batches.create({
    variantId,
    prepStateId: null,
    qty,
    unit: 'g',
    location: 'fridge',
    sourceType: 'purchase',
  });
}

describe('food.substitutions.resolveForLine — PRD-149', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  it('returns the line context + every valid candidate × batch pair on the happy path', async () => {
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oil = makeIngredientWithVariant('coconut-oil', 'refined');
    const recipe = makeCompiledRecipe('cookies');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    await addBatch(caller, oil.variantId, 500);
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 0.75,
      scope: 'global',
    });

    const result = await caller.food.substitutions.resolveForLine({
      recipeVersionId: recipe.recipeVersionId,
      lineIndex: 1,
    });

    expect(result.lineIndex).toBe(1);
    expect(result.lineVariantId).toBe(butter.variantId);
    expect(result.lineVariantName).toBe('unsalted');
    expect(result.lineQty).toBe(200);
    expect(result.lineUnit).toBe('g');
    expect(result.recipeContextTags).toEqual([]);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]?.ratio).toBe(0.75);
    expect(result.candidates[0]?.substituteIngredientName).toBe('coconut-oil');
    expect(result.candidates[0]?.batches.length).toBe(1);
    expect(result.candidates[0]?.batches[0]?.qtyRemaining).toBe(500);
  });

  it('returns empty candidates when no subs match the line', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const recipe = makeCompiledRecipe('tomato-soup');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });

    const result = await caller.food.substitutions.resolveForLine({
      recipeVersionId: recipe.recipeVersionId,
      lineIndex: 1,
    });

    expect(result.candidates).toEqual([]);
  });

  it('throws NOT_FOUND when the line index does not exist', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const recipe = makeCompiledRecipe('tomato-soup');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });

    await expect(
      caller.food.substitutions.resolveForLine({
        recipeVersionId: recipe.recipeVersionId,
        lineIndex: 99,
      })
    ).rejects.toThrow();
  });

  it('applies context-tag OR-overlap: tagged sub on tagged recipe surfaces', async () => {
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oil = makeIngredientWithVariant('coconut-oil', 'refined');
    const recipe = makeCompiledRecipe('vegan-cookies', { tags: ['vegan', 'dessert'] });
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    await addBatch(caller, oil.variantId, 500);
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
      contextTags: ['vegan'],
    });

    const result = await caller.food.substitutions.resolveForLine({
      recipeVersionId: recipe.recipeVersionId,
      lineIndex: 1,
    });

    expect(result.candidates.length).toBe(1);
    expect(result.recipeContextTags).toEqual(expect.arrayContaining(['vegan', 'dessert']));
  });

  it('applies context-tag OR-overlap: tagged sub on untagged recipe is filtered out', async () => {
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oil = makeIngredientWithVariant('coconut-oil', 'refined');
    const recipe = makeCompiledRecipe('cookies');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    await addBatch(caller, oil.variantId, 500);
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
      contextTags: ['vegan'],
    });

    const result = await caller.food.substitutions.resolveForLine({
      recipeVersionId: recipe.recipeVersionId,
      lineIndex: 1,
    });

    expect(result.candidates).toEqual([]);
  });

  it('recipe-scoped (from,to) pair overrides global; other global edges survive', async () => {
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oil = makeIngredientWithVariant('coconut-oil', 'refined');
    const ghee = makeIngredientWithVariant('ghee', 'clarified');
    const recipe = makeCompiledRecipe('cookies');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    await addBatch(caller, oil.variantId, 500);
    await addBatch(caller, ghee.variantId, 500);
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 0.75,
      scope: 'global',
    });
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: ghee.variantId },
      ratio: 1,
      scope: 'global',
    });
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 0.5,
      scope: 'recipe',
      recipeId: recipe.recipeId,
    });

    const result = await caller.food.substitutions.resolveForLine({
      recipeVersionId: recipe.recipeVersionId,
      lineIndex: 1,
    });

    const oilCandidate = result.candidates.find(
      (c) => c.substituteIngredientName === 'coconut-oil'
    );
    const gheeCandidate = result.candidates.find((c) => c.substituteIngredientName === 'ghee');
    expect(oilCandidate?.ratio).toBe(0.5);
    expect(oilCandidate?.scope).toBe('recipe');
    expect(gheeCandidate?.ratio).toBe(1);
    expect(gheeCandidate?.scope).toBe('global');
  });

  it('fans an ingredient-level `to` side across every variant of the target', async () => {
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oilIngredient = makeIngredientWithVariant('coconut-oil', 'refined');
    const oilVirgin = makeVariant(oilIngredient.ingredientId, 'virgin');
    const recipe = makeCompiledRecipe('cookies');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    await addBatch(caller, oilIngredient.variantId, 300);
    await addBatch(caller, oilVirgin, 200);
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { ingredientId: oilIngredient.ingredientId },
      ratio: 1,
      scope: 'global',
    });

    const result = await caller.food.substitutions.resolveForLine({
      recipeVersionId: recipe.recipeVersionId,
      lineIndex: 1,
    });

    expect(result.candidates.length).toBe(2);
    expect(result.candidates.every((c) => c.substituteIngredientName === 'coconut-oil')).toBe(true);
    const variantNames = result.candidates.map((c) => c.substituteVariantName).toSorted();
    expect(variantNames).toEqual(['refined', 'virgin']);
  });
});
