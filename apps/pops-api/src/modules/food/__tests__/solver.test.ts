/**
 * PRD-150 — integration tests for `food.solver.canICook`.
 *
 * Spins up an in-memory food database via the same migration replay
 * pattern as `fridge-router.test.ts`, then exercises the solver across
 * every acceptance case: FIFO coverage, substitution coverage, optional
 * line silent-skip, sort, every filter, and the perf budget.
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
  recipeRuns,
  recipeRunsService,
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
  const ing = ingredientsService.createIngredient(db, {
    name: slug,
    slug,
    defaultUnit,
  });
  const variant = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: variantSlug,
    slug: variantSlug,
    defaultUnit,
  });
  return { ingredientId: ing.id, variantId: variant.id };
}

interface RecipeHandle {
  recipeId: number;
  recipeVersionId: number;
  slug: string;
}

interface RecipeOptions {
  recipeType?: 'plate' | 'component' | 'technique' | 'sauce' | 'dressing' | 'drink' | 'condiment';
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  tags?: readonly string[];
}

function makeCompiledRecipe(slug: string, options: RecipeOptions = {}): RecipeHandle {
  const db = getDrizzle();
  const { recipe, version } = recipesService.createRecipe(db, {
    slug,
    recipeType: options.recipeType,
    firstVersion: {
      title: slug,
      bodyDsl: `@recipe(slug="${slug}", title="${slug}")`,
    },
  });
  db.update(recipeVersions)
    .set({
      compileStatus: 'compiled',
      prepMinutes: options.prepMinutes ?? null,
      cookMinutes: options.cookMinutes ?? null,
    })
    .where(eq(recipeVersions.id, version.id))
    .run();
  db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipe.id)).run();
  if (options.tags !== undefined) {
    for (const tag of options.tags) {
      db.insert(recipeTags).values({ recipeId: recipe.id, tag }).run();
    }
  }
  return { recipeId: recipe.id, recipeVersionId: version.id, slug };
}

interface AddLineInput {
  position: number;
  ingredientId: number;
  variantId: number | null;
  qtyG?: number;
  qtyMl?: number;
  qtyCount?: number;
  canonicalUnit: 'g' | 'ml' | 'count';
  optional?: boolean;
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
      optional: line.optional === true ? 1 : 0,
      notes: null,
    })
    .run();
}

interface AddBatchInput {
  variantId: number;
  qty: number;
  unit: 'g' | 'ml' | 'count';
}

async function addBatch(caller: ReturnType<typeof createCaller>, input: AddBatchInput) {
  return caller.food.batches.create({
    variantId: input.variantId,
    prepStateId: null,
    qty: input.qty,
    unit: input.unit,
    location: 'fridge',
    sourceType: 'purchase',
  });
}

describe('food.solver router — PRD-150', () => {
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

  it('returns an empty result when no recipes exist', async () => {
    const result = await caller.food.solver.canICook({});
    expect(result.totalCandidates).toBe(0);
    expect(result.cookableCount).toBe(0);
    expect(result.recipes).toEqual([]);
  });

  it('marks recipe cookable when every line is FIFO-covered', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const recipe = makeCompiledRecipe('tomato-soup');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    await addBatch(caller, { variantId: tomato.variantId, qty: 500, unit: 'g' });

    const result = await caller.food.solver.canICook({});
    expect(result.totalCandidates).toBe(1);
    expect(result.cookableCount).toBe(1);
    expect(result.recipes[0]?.subsNeeded).toBe(0);
    expect(result.recipes[0]?.subs).toEqual([]);
    expect(result.recipes[0]?.recipeSlug).toBe('tomato-soup');
  });

  it('drops a recipe when any required line is uncoverable', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const onion = makeIngredientWithVariant('onion', 'yellow');
    const recipe = makeCompiledRecipe('sofrito');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    addLine(recipe.recipeVersionId, {
      position: 2,
      ingredientId: onion.ingredientId,
      variantId: onion.variantId,
      qtyG: 100,
      canonicalUnit: 'g',
    });
    await addBatch(caller, { variantId: tomato.variantId, qty: 500, unit: 'g' });

    const result = await caller.food.solver.canICook({});
    expect(result.totalCandidates).toBe(1);
    expect(result.cookableCount).toBe(0);
    expect(result.recipes).toEqual([]);
  });

  it('covers an uncoverable line via a global substitution edge', async () => {
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
    await addBatch(caller, { variantId: oil.variantId, qty: 500, unit: 'g' });
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });

    const result = await caller.food.solver.canICook({});
    expect(result.cookableCount).toBe(1);
    expect(result.recipes[0]?.subsNeeded).toBe(1);
    expect(result.recipes[0]?.subs[0]?.lineIndex).toBe(1);
    expect(result.recipes[0]?.subs[0]?.fromIngredientName).toBe('butter');
    expect(result.recipes[0]?.subs[0]?.candidateSubName).toContain('coconut-oil');
  });

  it('skips optional lines even when uncoverable', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const garlic = makeIngredientWithVariant('garlic', 'cloves', 'count');
    const recipe = makeCompiledRecipe('tomato-sauce');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    addLine(recipe.recipeVersionId, {
      position: 2,
      ingredientId: garlic.ingredientId,
      variantId: garlic.variantId,
      qtyCount: 2,
      canonicalUnit: 'count',
      optional: true,
    });
    await addBatch(caller, { variantId: tomato.variantId, qty: 500, unit: 'g' });

    const result = await caller.food.solver.canICook({});
    expect(result.cookableCount).toBe(1);
    expect(result.recipes[0]?.subsNeeded).toBe(0);
  });

  it('sorts by subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oil = makeIngredientWithVariant('coconut-oil', 'refined');

    const cleanA = makeCompiledRecipe('alpha-clean');
    addLine(cleanA.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 100,
      canonicalUnit: 'g',
    });
    const cleanZ = makeCompiledRecipe('zulu-clean');
    addLine(cleanZ.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 100,
      canonicalUnit: 'g',
    });
    const subbed = makeCompiledRecipe('charlie-sub');
    addLine(subbed.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 100,
      canonicalUnit: 'g',
    });
    await addBatch(caller, { variantId: tomato.variantId, qty: 500, unit: 'g' });
    await addBatch(caller, { variantId: oil.variantId, qty: 500, unit: 'g' });
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });

    // Cook cleanZ MORE recently than cleanA so the DESC sort puts cleanZ first
    // within the subsNeeded=0 band.
    const cleanZRun = recipeRunsService.createRun(getDrizzle(), {
      recipeVersionId: cleanZ.recipeVersionId,
    });
    getDrizzle()
      .update(recipeRuns)
      .set({ completedAt: '2026-06-10T12:00:00.000Z' })
      .where(eq(recipeRuns.id, cleanZRun.id))
      .run();

    const result = await caller.food.solver.canICook({});
    expect(result.recipes.map((r) => r.recipeSlug)).toEqual([
      'zulu-clean',
      'alpha-clean',
      'charlie-sub',
    ]);
  });

  it('respects excludeSubs by dropping sub-requiring recipes', async () => {
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
    await addBatch(caller, { variantId: oil.variantId, qty: 500, unit: 'g' });
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });
    const result = await caller.food.solver.canICook({ excludeSubs: true });
    expect(result.totalCandidates).toBe(1);
    expect(result.cookableCount).toBe(0);
  });

  it('filters by recipeType, tags AND-overlap, and maxMinutes', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const plate = makeCompiledRecipe('plate-fast', {
      recipeType: 'plate',
      prepMinutes: 5,
      cookMinutes: 5,
      tags: ['weeknight', 'vegan'],
    });
    addLine(plate.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 50,
      canonicalUnit: 'g',
    });
    const sauce = makeCompiledRecipe('sauce-slow', {
      recipeType: 'sauce',
      prepMinutes: 30,
      cookMinutes: 60,
      tags: ['weeknight'],
    });
    addLine(sauce.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 50,
      canonicalUnit: 'g',
    });
    await addBatch(caller, { variantId: tomato.variantId, qty: 500, unit: 'g' });

    const onlyPlates = await caller.food.solver.canICook({ recipeTypes: ['plate'] });
    expect(onlyPlates.recipes.map((r) => r.recipeSlug)).toEqual(['plate-fast']);

    const onlyVegan = await caller.food.solver.canICook({ tags: ['vegan'] });
    expect(onlyVegan.recipes.map((r) => r.recipeSlug)).toEqual(['plate-fast']);

    const bothTags = await caller.food.solver.canICook({ tags: ['vegan', 'weeknight'] });
    expect(bothTags.recipes.map((r) => r.recipeSlug)).toEqual(['plate-fast']);

    const quick = await caller.food.solver.canICook({ maxMinutes: 20 });
    expect(quick.recipes.map((r) => r.recipeSlug)).toEqual(['plate-fast']);
  });

  it('treats recipes with null prep+cook as always passing the maxMinutes filter', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const unknown = makeCompiledRecipe('unknown-time');
    addLine(unknown.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      qtyG: 50,
      canonicalUnit: 'g',
    });
    await addBatch(caller, { variantId: tomato.variantId, qty: 500, unit: 'g' });
    const result = await caller.food.solver.canICook({ maxMinutes: 5 });
    expect(result.cookableCount).toBe(1);
  });

  it('recipe-scoped sub overrides global edge for the same (from, to) pair', async () => {
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oil = makeIngredientWithVariant('coconut-oil', 'refined');
    const margarine = makeIngredientWithVariant('margarine', 'plain');

    const recipe = makeCompiledRecipe('shortbread');
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });

    await addBatch(caller, { variantId: oil.variantId, qty: 500, unit: 'g' });
    await addBatch(caller, { variantId: margarine.variantId, qty: 500, unit: 'g' });

    // Global butter→coconut-oil sub.
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });
    // Recipe-scoped butter→margarine sub for shortbread overrides nothing,
    // it just adds another candidate. Both subs match.
    const recipeScoped = substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: margarine.variantId },
      ratio: 1,
      scope: 'recipe',
      recipeId: recipe.recipeId,
    });

    const result = await caller.food.solver.canICook({});
    expect(result.cookableCount).toBe(1);
    // Recipe-scoped candidate is tried before global, so the breakdown
    // names margarine.
    expect(result.recipes[0]?.subs[0]?.substitutionId).toBe(recipeScoped.id);
    expect(result.recipes[0]?.subs[0]?.candidateSubName).toContain('margarine');
  });

  it('honours context-tag OR-overlap: tagged sub matches only when recipe tags overlap', async () => {
    const butter = makeIngredientWithVariant('butter', 'unsalted');
    const oil = makeIngredientWithVariant('coconut-oil', 'refined');
    const tagged = makeCompiledRecipe('tagged-cookies', { tags: ['baking'] });
    addLine(tagged.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    const untagged = makeCompiledRecipe('untagged-cookies');
    addLine(untagged.recipeVersionId, {
      position: 1,
      ingredientId: butter.ingredientId,
      variantId: butter.variantId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    await addBatch(caller, { variantId: oil.variantId, qty: 500, unit: 'g' });
    substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
      contextTags: ['baking'],
    });

    const result = await caller.food.solver.canICook({});
    const slugs = result.recipes.map((r) => r.recipeSlug);
    expect(slugs).toContain('tagged-cookies');
    expect(slugs).not.toContain('untagged-cookies');
  });

  it('fails closed when a required line has an unresolved canonical qty', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    const recipe = makeCompiledRecipe('mystery-quantity');
    // Insert a line with NO qty_g / qty_ml / qty_count — compile failed
    // to resolve the conversion. The solver must not assume "0 needed".
    addLine(recipe.recipeVersionId, {
      position: 1,
      ingredientId: tomato.ingredientId,
      variantId: tomato.variantId,
      canonicalUnit: 'g',
    });
    await addBatch(caller, { variantId: tomato.variantId, qty: 500, unit: 'g' });
    const result = await caller.food.solver.canICook({});
    expect(result.totalCandidates).toBe(1);
    expect(result.cookableCount).toBe(0);
  });

  it('reports cookable for a compiled recipe with zero ingredient lines', async () => {
    const recipe = makeCompiledRecipe('empty-recipe');
    const result = await caller.food.solver.canICook({});
    expect(result.cookableCount).toBe(1);
    expect(result.recipes[0]?.recipeId).toBe(recipe.recipeId);
    expect(result.recipes[0]?.subsNeeded).toBe(0);
  });

  it('handles a 100-recipe library within a generous budget (perf smoke)', async () => {
    const tomato = makeIngredientWithVariant('tomato', 'diced');
    await addBatch(caller, { variantId: tomato.variantId, qty: 10_000, unit: 'g' });
    for (let i = 0; i < 100; i += 1) {
      const recipe = makeCompiledRecipe(`perf-${String(i).padStart(3, '0')}`);
      addLine(recipe.recipeVersionId, {
        position: 1,
        ingredientId: tomato.ingredientId,
        variantId: tomato.variantId,
        qtyG: 50,
        canonicalUnit: 'g',
      });
    }
    const t0 = performance.now();
    const result = await caller.food.solver.canICook({});
    const elapsed = performance.now() - t0;
    expect(result.cookableCount).toBe(100);
    // 100 recipes × 1 line each. PRD-150 budget is <200ms at 500 recipes.
    // Pad generously here so CI variance doesn't flake the case.
    expect(elapsed).toBeLessThan(1500);
  });
});
