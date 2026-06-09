/**
 * Round-trip parity test — PRD-121 AC line 248.
 *
 * Compiles a small DSL fixture through PRDs 114 → 115 → 117 → 116, then
 * builds the `RecipeVersionWithCompiledData` joined payload from the
 * resulting rows and feeds it to `RecipeRenderer`. Asserts the rendered
 * DOM contains the structural elements the compile pipeline emitted:
 * ingredient rows for every `recipe_lines` row, step bodies with the
 * right number of substituted chips / timers / temps.
 *
 * The PRD AC specifies "PRD-113's 5 sample recipes" but PRD-113 Phase 2
 * (the DSL recipe bodies actually compiled via compileRecipeVersion) is
 * gated on follow-up work. v1 here uses 2 local fixtures covering the
 * grammar dimensions a renderer reasonably exercises (multi-step body
 * with ingredient + timer + temperature; variant + prep yield label).
 * AC line 248 stays unchecked until PRD-113 Phase 2 wires the full set —
 * tracked as a deferred-AC follow-up in the PR description and the
 * roadmap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ingredients,
  ingredientVariants,
  prepStates,
  recipeLines,
  recipes,
  recipeSteps,
  recipeTags,
  recipeVersions,
} from '../../db/schema';
import { createIngredient } from '../../db/services/ingredients';
import { createPrepState } from '../../db/services/prep-states';
import { createRecipe } from '../../db/services/recipes';
import { createVariant } from '../../db/services/variants';
import { compileRecipeVersion } from '../../dsl/compile';
import { RecipeRenderer } from '../RecipeRenderer';

import type { FoodDb } from '../../db/services/internal';
import type {
  RecipeLineWithResolved,
  RecipeVersionWithCompiledData,
} from '../RecipeRenderer.types';

const MIGRATIONS = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0065_prd_116_recipe_compile.sql',
  // PRD-123 — `compileRecipeVersion` consults `unit_conversions` +
  // `ingredient_weights` via `normaliseLineQty`. The fixture DSL uses only
  // canonical units (g / count), so the lookup falls through to the
  // unresolved path; the tables still need to exist or the prepared
  // statement preparation fails before that fallback can run.
  '0066_prd_123_conversions.sql',
].map((name) =>
  readFileSync(
    join(__dirname, '../../../../../apps/pops-api/src/db/drizzle-migrations', name),
    'utf8'
  )
);

function freshDb(): FoodDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    const stmts = migration.split('--> statement-breakpoint');
    for (const stmt of stmts) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) raw.exec(trimmed);
    }
  }
  return drizzle(raw);
}

function seedFixtureIngredients(db: FoodDb): void {
  const banana = createIngredient(db, { name: 'Banana', slug: 'banana', defaultUnit: 'count' });
  createIngredient(db, { name: 'Butter', slug: 'butter', defaultUnit: 'g' });
  createIngredient(db, { name: 'Sugar', slug: 'sugar', defaultUnit: 'g' });
  const tomato = createIngredient(db, { name: 'Tomato', slug: 'tomato', defaultUnit: 'count' });
  createVariant(db, {
    ingredientId: banana.id,
    name: 'Mashed banana',
    slug: 'mashed',
    defaultUnit: 'g',
  });
  createVariant(db, {
    ingredientId: tomato.id,
    name: 'Roma tomato',
    slug: 'roma',
    defaultUnit: 'count',
  });
  createPrepState(db, { name: 'Mashed', slug: 'mashed' });
  createPrepState(db, { name: 'Braised', slug: 'braised' });
}

/**
 * Build the joined renderer payload for `versionId` after `compileRecipeVersion`
 * has run. Mimics what PRD-119's `food.recipes.getForRendering` server
 * procedure will do — joins out the display names so the renderer doesn't
 * round-trip.
 */
function buildRenderPayload(db: FoodDb, versionId: number): RecipeVersionWithCompiledData {
  const version = db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.id, versionId))
    .all()[0]!;
  const recipe = db.select().from(recipes).where(eq(recipes.id, version.recipeId)).all()[0]!;

  const lineRows = db
    .select()
    .from(recipeLines)
    .where(eq(recipeLines.recipeVersionId, versionId))
    .all();

  const lines: RecipeLineWithResolved[] = lineRows.map((row) => {
    const ingredient = db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, row.ingredientId))
      .all()[0]!;
    const variant = row.variantId
      ? db
          .select()
          .from(ingredientVariants)
          .where(eq(ingredientVariants.id, row.variantId))
          .all()[0]
      : undefined;
    const prep = row.prepStateId
      ? db.select().from(prepStates).where(eq(prepStates.id, row.prepStateId)).all()[0]
      : undefined;
    return {
      id: row.id,
      position: row.position,
      ingredientId: row.ingredientId,
      variantId: row.variantId,
      prepStateId: row.prepStateId,
      isRecipeRef: Boolean(row.isRecipeRef),
      recipeRefId: row.recipeRefId,
      originalText: row.originalText,
      originalQty: row.originalQty,
      originalUnit: row.originalUnit,
      qtyG: row.qtyG,
      qtyMl: row.qtyMl,
      qtyCount: row.qtyCount,
      canonicalUnit: row.canonicalUnit,
      optional: Boolean(row.optional),
      notes: row.notes,
      ingredientName: ingredient.name,
      ingredientSlug: ingredient.slug,
      variantName: variant?.name ?? null,
      variantSlug: variant?.slug ?? null,
      prepStateName: prep?.name ?? null,
      prepStateSlug: prep?.slug ?? null,
      recipeRefSlug: null,
      recipeRefTitle: null,
    };
  });

  const steps = db
    .select()
    .from(recipeSteps)
    .where(eq(recipeSteps.recipeVersionId, versionId))
    .all();

  const yieldIngredient = version.yieldIngredientId
    ? (db
        .select()
        .from(ingredients)
        .where(eq(ingredients.id, version.yieldIngredientId))
        .all()[0] ?? null)
    : null;
  const yieldVariant = version.yieldVariantId
    ? (db
        .select()
        .from(ingredientVariants)
        .where(eq(ingredientVariants.id, version.yieldVariantId))
        .all()[0] ?? null)
    : null;
  const yieldPrepState = version.yieldPrepStateId
    ? (db.select().from(prepStates).where(eq(prepStates.id, version.yieldPrepStateId)).all()[0] ??
      null)
    : null;

  const tags = db
    .select()
    .from(recipeTags)
    .where(eq(recipeTags.recipeId, recipe.id))
    .all()
    .map((t) => t.tag);

  return {
    version,
    recipe,
    lines,
    steps,
    yieldIngredient,
    yieldVariant,
    yieldPrepState,
    tags,
  };
}

const PANCAKES_DSL = `@recipe(slug="parity-pancakes", title="Parity pancakes", servings=2, prep_time=5:min, cook_time=10:min)
@yield(banana, 4:count)
@ingredient(1, banana, 250:g)
@ingredient(2, butter, 10:g)
@ingredient(3, sugar, 50:g)
@step("Mash the @1 and whisk in the @3.")
@step("Melt the @2, wait @time(2:min).")
@step("Cook at @temperature(180:c) for @time(8:min).")
`;

const YIELD_DSL = `@recipe(slug="parity-tomato", title="Parity tomato sauce", servings=4)
@yield(tomato:roma:braised, 500:g)
@ingredient(1, tomato:roma, 4:count)
@step("Braise the @1 slowly.")
`;

describe('PRD-121 — Round-trip parity (compile → render)', () => {
  let db: FoodDb;

  beforeEach(() => {
    db = freshDb();
    seedFixtureIngredients(db);
  });

  it('renders every recipe_lines row as an ingredient list <li>', () => {
    const { version } = createRecipe(db, {
      slug: 'parity-pancakes',
      firstVersion: { title: 'Parity pancakes', bodyDsl: PANCAKES_DSL },
    });
    const result = compileRecipeVersion(version.id, db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineCount).toBe(3);
    expect(result.stepCount).toBe(3);

    render(<RecipeRenderer recipeVersion={buildRenderPayload(db, version.id)} />);

    expect(screen.getAllByTestId('recipe-ingredient-row')).toHaveLength(3);
  });

  it('substitutes step body anchors with rendered chips, timers, and temp badges', () => {
    const { version } = createRecipe(db, {
      slug: 'parity-pancakes',
      firstVersion: { title: 'Parity pancakes', bodyDsl: PANCAKES_DSL },
    });
    compileRecipeVersion(version.id, db);
    render(<RecipeRenderer recipeVersion={buildRenderPayload(db, version.id)} />);

    // Three steps → three ingredient chips (one per `@N` ref in the body)
    // plus the in-body refs from each step.
    const chips = screen.getAllByTestId('ingredient-chip');
    expect(chips.length).toBeGreaterThanOrEqual(3);

    // Two `@time(...)` calls in the body → two TimerButtons.
    expect(screen.getAllByTestId('timer-button')).toHaveLength(2);

    // One `@temperature(180:c)` → one TempBadge.
    expect(screen.getAllByTestId('temp-badge').length).toBeGreaterThanOrEqual(1);
  });

  it('assembles the yield label from variant + prep + qty', () => {
    const { version } = createRecipe(db, {
      slug: 'parity-tomato',
      firstVersion: { title: 'Parity tomato sauce', bodyDsl: YIELD_DSL },
    });
    const result = compileRecipeVersion(version.id, db);
    expect(result.ok).toBe(true);
    render(<RecipeRenderer recipeVersion={buildRenderPayload(db, version.id)} />);

    const yieldLine = screen.getByTestId('recipe-yield');
    expect(yieldLine).toHaveTextContent(/tomato/i);
    expect(yieldLine).toHaveTextContent(/roma/i);
    expect(yieldLine).toHaveTextContent(/braised/i);
    expect(yieldLine).toHaveTextContent(/500/);
    expect(yieldLine).toHaveTextContent(/g/);
  });

  it('renders header columns from recipe_versions after compile', () => {
    const { version } = createRecipe(db, {
      slug: 'parity-pancakes',
      firstVersion: { title: 'Parity pancakes', bodyDsl: PANCAKES_DSL },
    });
    compileRecipeVersion(version.id, db);
    render(<RecipeRenderer recipeVersion={buildRenderPayload(db, version.id)} />);

    expect(screen.getByRole('heading', { level: 1, name: /parity pancakes/i })).toBeInTheDocument();
    expect(screen.getByTestId('recipe-servings')).toHaveTextContent('2');
    expect(screen.getByTestId('recipe-prep')).toHaveTextContent('5');
    expect(screen.getByTestId('recipe-cook')).toHaveTextContent('10');
  });
});
