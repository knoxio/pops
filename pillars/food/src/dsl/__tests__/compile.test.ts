/**
 * PRD-116 — compile pipeline invariants.
 *
 * Each test runs `compileRecipeVersion` against a seeded recipe_versions
 * row and asserts BOTH the returned `CompileResult` and the resulting DB
 * state (recipe_lines, recipe_steps, recipe_version_proposed_slugs, and
 * the recipe_versions columns the compile mutates).
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../../db/open-food-db.js';
import {
  recipeLines,
  recipeSteps,
  recipeVersionProposedSlugs,
  recipeVersions,
} from '../../db/schema.js';
import * as conversionsService from '../../db/services/conversions.js';
import * as ingredientsService from '../../db/services/ingredients.js';
import { type FoodDb } from '../../db/services/internal.js';
import * as prepStatesService from '../../db/services/prep-states.js';
import * as recipesService from '../../db/services/recipes.js';
import * as variantsService from '../../db/services/variants.js';
import { compileRecipeVersion } from '../compile.js';

const { createIngredientWeight, createUnitConversion } = conversionsService;
const { createIngredient } = ingredientsService;
const { createPrepState } = prepStatesService;
const { createRecipe } = recipesService;
const { createVariant } = variantsService;

function freshDb(): FoodDb {
  return openFoodDb(':memory:').db;
}

function seedKnownIngredients(db: FoodDb): void {
  const banana = createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
  createIngredient(db, { name: 'Butter', slug: 'butter', defaultUnit: 'g' });
  createIngredient(db, { name: 'Sugar', slug: 'sugar', defaultUnit: 'g' });
  createIngredient(db, { name: 'Milk', slug: 'milk', defaultUnit: 'ml' });
  createIngredient(db, { name: 'Egg', slug: 'egg', defaultUnit: 'count' });
  createVariant(db, { ingredientId: banana.id, name: 'Mashed', slug: 'mashed', defaultUnit: 'g' });
  createPrepState(db, { name: 'Mashed prep', slug: 'mashed' });
}

function makeRecipe(db: FoodDb, slug: string, bodyDsl: string): number {
  const { version } = createRecipe(db, {
    slug,
    firstVersion: { title: slug, bodyDsl },
  });
  return version.id;
}

const HAPPY_DSL = `@recipe(slug="happy", title="Happy", servings=2)
@yield(banana, 1:count)
@ingredient(1, banana, 1:count)
@ingredient(2, butter, 10:g)
@ingredient(3, sugar, 50:g)
@ingredient(4, milk, 100:ml)
@ingredient(5, egg, 2:count)
@step("Whisk @5 with @2.")
@step("Add @3 and @4.")
@step("Garnish with @1 sliced.")
`;

describe('PRD-116 — compile pipeline: happy path', () => {
  let db: FoodDb;

  beforeEach(() => {
    db = freshDb();
    seedKnownIngredients(db);
  });

  it('compiles a 5-ingredient + 3-step recipe; row counts match the DSL', () => {
    const versionId = makeRecipe(db, 'happy', HAPPY_DSL);
    const result = compileRecipeVersion(versionId, db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineCount).toBe(5);
    expect(result.stepCount).toBe(3);
    expect(result.creationCount).toBe(0);

    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => l.position).toSorted()).toEqual([1, 2, 3, 4, 5]);

    const steps = db
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeVersionId, versionId))
      .all();
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.position).toSorted()).toEqual([1, 2, 3]);
  });

  it('writes the header columns onto recipe_versions', () => {
    const versionId = makeRecipe(db, 'happy', HAPPY_DSL);
    compileRecipeVersion(versionId, db);
    const row = db.select().from(recipeVersions).where(eq(recipeVersions.id, versionId)).all();
    expect(row[0]?.compileStatus).toBe('compiled');
    expect(row[0]?.servings).toBe(2);
    expect(row[0]?.yieldIngredientId).not.toBeNull();
  });

  it('identity carry-over: original_unit=g sets qty_g, others null', () => {
    const versionId = makeRecipe(db, 'happy', HAPPY_DSL);
    compileRecipeVersion(versionId, db);
    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    const butter = lines.find((l) => l.originalUnit === 'g');
    expect(butter?.qtyG).not.toBeNull();
    expect(butter?.qtyMl).toBeNull();
    expect(butter?.qtyCount).toBeNull();
    expect(butter?.canonicalUnit).toBe('g');
  });

  it('PRD-123 conversion: cup is rewritten via unit_conversions when seeded', () => {
    createUnitConversion(db, { fromUnit: 'cup', toUnit: 'ml', ratio: 240, isSeeded: true });
    const versionId = makeRecipe(
      db,
      'cup-with-conv',
      `@recipe(slug="cup-with-conv", title="Cup")
@yield(banana, 1:count)
@ingredient(1, milk, 2:cup)
@step("Pour @1.")
`
    );
    compileRecipeVersion(versionId, db);
    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    expect(lines[0]?.qtyMl).toBe(480);
    expect(lines[0]?.canonicalUnit).toBe('ml');
  });

  it('PRD-123 conversion: ingredient_weights "medium" → qty_g for the right ingredient', () => {
    const onion = createIngredient(db, { name: 'Onion', slug: 'onion', defaultUnit: 'count' });
    createIngredientWeight(db, {
      ingredientId: onion.id,
      variantId: null,
      unit: 'medium',
      grams: 150,
      isSeeded: true,
    });
    const versionId = makeRecipe(
      db,
      'medium-onion',
      `@recipe(slug="medium-onion", title="Soup")
@yield(banana, 1:count)
@ingredient(1, onion, 2:medium)
@step("Dice @1.")
`
    );
    compileRecipeVersion(versionId, db);
    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    expect(lines[0]?.qtyG).toBe(300);
    expect(lines[0]?.canonicalUnit).toBe('g');
  });

  it('non-canonical unit (cup) leaves qty_* null and falls back to ingredient default_unit', () => {
    const versionId = makeRecipe(
      db,
      'cup-recipe',
      `@recipe(slug="cup-recipe", title="Cup")
@yield(banana, 1:count)
@ingredient(1, milk, 1:cup)
@step("Pour @1.")
`
    );
    compileRecipeVersion(versionId, db);
    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    expect(lines[0]?.qtyG).toBeNull();
    expect(lines[0]?.qtyMl).toBeNull();
    expect(lines[0]?.qtyCount).toBeNull();
    expect(lines[0]?.canonicalUnit).toBe('ml'); // milk's default_unit
  });

  it('step body_md rewrites @N refs to anchor links', () => {
    const versionId = makeRecipe(db, 'happy', HAPPY_DSL);
    compileRecipeVersion(versionId, db);
    const steps = db
      .select({ bodyMd: recipeSteps.bodyMd, position: recipeSteps.position })
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeVersionId, versionId))
      .all();
    const first = steps.find((s) => s.position === 1);
    expect(first?.bodyMd).toMatch(/\[egg\]\(#line-5\)/);
    expect(first?.bodyMd).toMatch(/\[butter\]\(#line-2\)/);
  });
});

describe('PRD-116 — compile pipeline: idempotency + replace', () => {
  let db: FoodDb;

  beforeEach(() => {
    db = freshDb();
    seedKnownIngredients(db);
  });

  it('idempotent: compiling twice produces the same row counts', () => {
    const versionId = makeRecipe(db, 'happy', HAPPY_DSL);
    compileRecipeVersion(versionId, db);
    compileRecipeVersion(versionId, db);
    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    const steps = db
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeVersionId, versionId))
      .all();
    expect(lines).toHaveLength(5);
    expect(steps).toHaveLength(3);
  });

  it('replace semantics: shrinking the DSL purges the old rows', () => {
    const versionId = makeRecipe(db, 'happy', HAPPY_DSL);
    compileRecipeVersion(versionId, db);
    // Edit body_dsl down to 3 lines.
    db.update(recipeVersions)
      .set({
        bodyDsl: `@recipe(slug="happy", title="Happy", servings=2)
@yield(banana, 1:count)
@ingredient(1, banana, 1:count)
@ingredient(2, butter, 10:g)
@ingredient(3, sugar, 50:g)
@step("Mash @1 with @2.")
`,
      })
      .where(eq(recipeVersions.id, versionId))
      .run();
    compileRecipeVersion(versionId, db);
    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    expect(lines).toHaveLength(3);
  });
});

describe('PRD-116 — compile pipeline: failure phases', () => {
  let db: FoodDb;

  beforeEach(() => {
    db = freshDb();
    seedKnownIngredients(db);
  });

  it('parse phase: empty DSL fails with MissingRecipeHeader + clears stale proposedSlugs', () => {
    const versionId = makeRecipe(db, 'broken', '');
    // Seed a stale proposed-slug row from a notional prior compile so we can
    // verify the parse-failure path clears it (PRD-116 invariant — a parse
    // failure leaves the version's review-queue surface empty).
    db.insert(recipeVersionProposedSlugs)
      .values({
        recipeVersionId: versionId,
        slug: 'leftover-from-prior',
        suggestedKind: 'ingredient',
        fromLocJson: JSON.stringify({ startLine: 1, startCol: 1, endLine: 1, endCol: 1 }),
      })
      .run();
    const result = compileRecipeVersion(versionId, db);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.phase).toBe('parse');
    expect(result.errors.length).toBeGreaterThan(0);
    const row = db
      .select({ compileStatus: recipeVersions.compileStatus })
      .from(recipeVersions)
      .where(eq(recipeVersions.id, versionId))
      .all();
    expect(row[0]?.compileStatus).toBe('failed');
    expect(
      db.select().from(recipeLines).where(eq(recipeLines.recipeVersionId, versionId)).all()
    ).toHaveLength(0);
    expect(
      db
        .select()
        .from(recipeVersionProposedSlugs)
        .where(eq(recipeVersionProposedSlugs.recipeVersionId, versionId))
        .all()
    ).toHaveLength(0);
  });

  it('resolve phase: unknown prep_state persists a proposedSlugs row + leaves compile_status=failed', () => {
    const versionId = makeRecipe(
      db,
      'bad-prep',
      `@recipe(slug="bad-prep", title="Bad prep")
@yield(banana, 1:count)
@ingredient(1, banana:_:never-heard-of-this, 1:count)
@step("Use @1.")
`
    );
    const result = compileRecipeVersion(versionId, db);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.phase).toBe('resolve');
    const proposed = db
      .select()
      .from(recipeVersionProposedSlugs)
      .where(eq(recipeVersionProposedSlugs.recipeVersionId, versionId))
      .all();
    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.slug).toBe('never-heard-of-this');
  });

  it('auto-creation: unknown ingredient slug succeeds + creates the row', () => {
    const versionId = makeRecipe(
      db,
      'with-novel',
      `@recipe(slug="with-novel", title="Novel")
@yield(banana, 1:count)
@ingredient(1, made-up-thing, 100:g)
@step("Toss @1.")
`
    );
    const result = compileRecipeVersion(versionId, db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.creationCount).toBeGreaterThanOrEqual(1);
    // After compile, the auto-created ingredient exists.
    const lines = db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeVersionId, versionId))
      .all();
    expect(lines[0]?.ingredientId).not.toBeNull();
  });

  it('resolve phase: re-compile with a new unknown slug replaces prior proposedSlugs rows', () => {
    const versionId = makeRecipe(
      db,
      'bad-prep',
      `@recipe(slug="bad-prep-2", title="Bad prep 2")
@yield(banana, 1:count)
@ingredient(1, banana:_:never-heard-of-this, 1:count)
@step("Use @1.")
`
    );
    compileRecipeVersion(versionId, db);
    // Edit body_dsl and recompile — proposedSlugs from the prior compile
    // should be cleared and replaced.
    db.update(recipeVersions)
      .set({
        bodyDsl: `@recipe(slug="bad-prep-2", title="Bad prep 2")
@yield(banana, 1:count)
@ingredient(1, banana:_:another-prep-slug, 1:count)
@step("Use @1.")
`,
      })
      .where(eq(recipeVersions.id, versionId))
      .run();
    compileRecipeVersion(versionId, db);
    const proposed = db
      .select({ slug: recipeVersionProposedSlugs.slug })
      .from(recipeVersionProposedSlugs)
      .where(eq(recipeVersionProposedSlugs.recipeVersionId, versionId))
      .all();
    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.slug).toBe('another-prep-slug');
  });
});
