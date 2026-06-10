/**
 * PRD-149 — integration tests for substitution-edge overrides flowing
 * through `food.cook.markCooked`.
 *
 * Covers:
 *  - Happy path: `batch-override` with `substitutionEdgeId` set draws
 *    from a sub batch + writes the substitution audit line to
 *    `recipe_runs.notes`.
 *  - `SubstitutionEdgeInvalid` when the edge id no longer exists.
 *  - Variant mismatch between the chosen batch and the sub's `to` side
 *    surfaces `SubstitutionEdgeInvalid` (a client can't smuggle an
 *    unrelated batch via the sub path).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  batches,
  batchConsumptions,
  ingredientsService,
  recipeLines,
  recipeRuns,
  recipes,
  recipesService,
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

function makeIngredient(slug: string, variantSlug: string): VariantHandle {
  const db = getDrizzle();
  const ing = ingredientsService.createIngredient(db, { name: slug, slug, defaultUnit: 'g' });
  const variant = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: variantSlug,
    slug: variantSlug,
    defaultUnit: 'g',
  });
  return { ingredientId: ing.id, variantId: variant.id };
}

interface RecipeHandle {
  recipeId: number;
  versionId: number;
}

function makeCompiledRecipe(slug: string): RecipeHandle {
  const db = getDrizzle();
  const { recipe, version } = recipesService.createRecipe(db, {
    slug,
    firstVersion: { title: slug, bodyDsl: `@recipe(slug="${slug}", title="${slug}")` },
  });
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled', servings: 4 })
    .where(eq(recipeVersions.id, version.id))
    .run();
  db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipe.id)).run();
  return { recipeId: recipe.id, versionId: version.id };
}

function addLine(versionId: number, position: number, handle: VariantHandle, qtyG: number): void {
  getDrizzle()
    .insert(recipeLines)
    .values({
      recipeVersionId: versionId,
      position,
      ingredientId: handle.ingredientId,
      variantId: handle.variantId,
      prepStateId: null,
      isRecipeRef: 0,
      recipeRefId: null,
      originalText: 'seed',
      originalQty: qtyG,
      originalUnit: 'g',
      qtyG,
      qtyMl: null,
      qtyCount: null,
      canonicalUnit: 'g',
      optional: 0,
      notes: null,
    })
    .run();
}

async function seedBatch(
  caller: ReturnType<typeof createCaller>,
  variantId: number,
  qty: number
): Promise<number> {
  const result = await caller.food.batches.create({
    variantId,
    prepStateId: null,
    qty,
    unit: 'g',
    location: 'fridge',
    sourceType: 'purchase',
  });
  return result.batchId;
}

describe('food.cook.markCooked with substitution overrides — PRD-149', () => {
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

  it('accepts a batch-override with substitutionEdgeId, draws from the sub batch, and writes the audit line', async () => {
    const butter = makeIngredient('butter', 'unsalted');
    const oil = makeIngredient('coconut-oil', 'refined');
    const recipe = makeCompiledRecipe('cookies');
    addLine(recipe.versionId, 1, butter, 200);
    const oilBatchId = await seedBatch(caller, oil.variantId, 500);
    const edge = substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });

    const result = await caller.food.cook.markCooked({
      recipeVersionId: recipe.versionId,
      scaleFactor: 1,
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: oilBatchId,
          consumeQty: 200,
          unit: 'g',
          substitutionEdgeId: edge.id,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const db = getDrizzle();
    const consumptions = db
      .select()
      .from(batchConsumptions)
      .where(eq(batchConsumptions.recipeRunId, result.recipeRunId))
      .all();
    expect(consumptions).toHaveLength(1);
    expect(consumptions[0]?.batchId).toBe(oilBatchId);
    expect(consumptions[0]?.qtyConsumed).toBe(200);

    const sourceBatch = db.select().from(batches).where(eq(batches.id, oilBatchId)).all()[0];
    expect(sourceBatch?.qtyRemaining).toBe(300);

    const run = db.select().from(recipeRuns).where(eq(recipeRuns.id, result.recipeRunId)).all()[0];
    expect(run?.notes ?? '').toContain('cook-override:substitution');
    expect(run?.notes ?? '').toContain(`edge=${edge.id}`);
    expect(run?.notes ?? '').toContain(`batch=${oilBatchId}`);
    expect(run?.notes ?? '').toContain('coconut-oil');
  });

  it('returns SubstitutionEdgeInvalid when the substitutionEdgeId does not exist', async () => {
    const butter = makeIngredient('butter', 'unsalted');
    const oil = makeIngredient('coconut-oil', 'refined');
    const recipe = makeCompiledRecipe('cookies');
    addLine(recipe.versionId, 1, butter, 200);
    const oilBatchId = await seedBatch(caller, oil.variantId, 500);

    const result = await caller.food.cook.markCooked({
      recipeVersionId: recipe.versionId,
      scaleFactor: 1,
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: oilBatchId,
          consumeQty: 200,
          unit: 'g',
          substitutionEdgeId: 99999,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SubstitutionEdgeInvalid');
  });

  it('returns SubstitutionEdgeInvalid when the batch variant does not match the edge `to` side', async () => {
    const butter = makeIngredient('butter', 'unsalted');
    const oil = makeIngredient('coconut-oil', 'refined');
    const ghee = makeIngredient('ghee', 'clarified');
    const recipe = makeCompiledRecipe('cookies');
    addLine(recipe.versionId, 1, butter, 200);
    const gheeBatchId = await seedBatch(caller, ghee.variantId, 500);
    const edge = substitutionsService.createSubstitution(getDrizzle(), {
      from: { ingredientId: butter.ingredientId },
      to: { variantId: oil.variantId },
      ratio: 1,
      scope: 'global',
    });

    const result = await caller.food.cook.markCooked({
      recipeVersionId: recipe.versionId,
      scaleFactor: 1,
      consumptionOverrides: [
        {
          lineIndex: 1,
          kind: 'batch-override',
          batchId: gheeBatchId,
          consumeQty: 200,
          unit: 'g',
          substitutionEdgeId: edge.id,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SubstitutionEdgeInvalid');
  });
});
