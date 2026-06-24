/**
 * Recipe-graph cycle detection invariants
 * (spec: pillars/food/docs/prds/recipe-cycle-detection).
 *
 * The detector walks the recipe graph by reading `recipe_lines`. The
 * fixtures insert only the columns the detector reads
 * (`recipe_version_id`, `is_recipe_ref`, `recipe_ref_id`, plus the
 * NOT NULL columns), not the full materialised row.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../../db/open-food-db.js';
import { recipeVersions } from '../../db/schema.js';
import * as ingredientsService from '../../db/services/ingredients.js';
import { type FoodDb } from '../../db/services/internal.js';
import * as recipeVersionsService from '../../db/services/recipe-versions.js';
import * as recipesService from '../../db/services/recipes.js';
import { detectRecipeCycle } from '../cycle.js';

import type Database from 'better-sqlite3';

import type { ResolvedIngredientBlock, ResolvedRecipeAst } from '../resolver-types.js';

const { createIngredient } = ingredientsService;
const { promoteVersion } = recipeVersionsService;
const { createRecipe } = recipesService;

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

function makePromotedRecipe(
  db: FoodDb,
  slug: string,
  yieldIngredientId: number
): { recipeId: number; versionId: number } {
  const { recipe, version } = createRecipe(db, {
    slug,
    firstVersion: { title: slug, bodyDsl: `@recipe(${slug})` },
  });
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled', yieldIngredientId })
    .where(eq(recipeVersions.id, version.id))
    .run();
  promoteVersion(db, version.id);
  return { recipeId: recipe.id, versionId: version.id };
}

const refPositions = new Map<number, number>();

function addRecipeRef(
  raw: Database.Database,
  versionId: number,
  refRecipeId: number,
  ingredientId?: number
): void {
  const ingId = ingredientId ?? cachedYieldIngId;
  const position = (refPositions.get(versionId) ?? 0) + 1;
  refPositions.set(versionId, position);
  raw
    .prepare(
      `INSERT INTO recipe_lines
         (recipe_version_id, position, ingredient_id, is_recipe_ref, recipe_ref_id,
          original_text, original_qty, original_unit, canonical_unit)
       VALUES (?, ?, ?, 1, ?, 'ref', 1, 'count', 'count')`
    )
    .run(versionId, position, ingId, refRecipeId);
}

let cachedYieldIngId = 0;

function makeCandidateAst(
  refs: { recipeRef: number; index: number; line: number }[]
): ResolvedRecipeAst {
  // The detector reads `kind`, `isRecipeRef`, `recipeRef`, and `loc` off
  // each block — never `ingredientId` / `yieldIngredientId`. Leave the
  // unread fields null so the fixture doesn't depend on row-allocation
  // order.
  return {
    header: {
      slug: 'candidate',
      title: 'Candidate',
    },
    yield: {
      yieldIngredientId: null,
      yieldVariantId: null,
      yieldPrepStateId: null,
      yieldQty: 1,
      yieldUnit: 'count',
    },
    blocks: refs.map(
      (r): ResolvedIngredientBlock => ({
        kind: 'ingredient',
        index: r.index,
        ingredientId: null,
        variantId: null,
        prepStateId: null,
        qty: 1,
        unit: 'count',
        optional: false,
        notes: null,
        isRecipeRef: true,
        recipeRef: r.recipeRef,
        loc: { startLine: r.line, startCol: 1, endLine: r.line, endCol: 30 },
      })
    ),
  };
}

describe('recipe-graph cycle detection', () => {
  let db: FoodDb;
  let raw: Database.Database;
  let yieldIngId: number;

  beforeEach(() => {
    ({ db, raw } = freshDb());
    refPositions.clear();
    yieldIngId = createIngredient(db, {
      name: 'Yield',
      slug: 'common-yield',
      defaultUnit: 'count',
    }).id;
    cachedYieldIngId = yieldIngId;
  });

  it('happy path: candidate → B → C (terminal) returns ok', () => {
    const b = makePromotedRecipe(db, 'recipe-b', yieldIngId);
    const c = makePromotedRecipe(db, 'recipe-c', yieldIngId);
    addRecipeRef(raw, b.versionId, c.recipeId);
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    const ast = makeCandidateAst([{ recipeRef: b.recipeId, index: 1, line: 5 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(true);
  });

  it('3-cycle: candidate → B → C → candidate', () => {
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    const b = makePromotedRecipe(db, 'recipe-b', yieldIngId);
    const c = makePromotedRecipe(db, 'recipe-c', yieldIngId);
    addRecipeRef(raw, b.versionId, c.recipeId);
    addRecipeRef(raw, c.versionId, candidate.recipeId);
    const ast = makeCandidateAst([{ recipeRef: b.recipeId, index: 1, line: 7 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cycle.path[0]).toBe(candidate.recipeId);
    expect(result.cycle.path[result.cycle.path.length - 1]).toBe(candidate.recipeId);
    expect(result.cycle.path).toContain(b.recipeId);
    expect(result.cycle.path).toContain(c.recipeId);
    expect(result.cycle.offendingBlockLoc.startLine).toBe(7);
  });

  it('2-cycle: candidate → B → candidate', () => {
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    const b = makePromotedRecipe(db, 'recipe-b', yieldIngId);
    addRecipeRef(raw, b.versionId, candidate.recipeId);
    const ast = makeCandidateAst([{ recipeRef: b.recipeId, index: 1, line: 9 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cycle.path).toEqual([candidate.recipeId, b.recipeId, candidate.recipeId]);
  });

  it('self-loop (defensive): candidate → candidate directly', () => {
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    const ast = makeCandidateAst([{ recipeRef: candidate.recipeId, index: 1, line: 11 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cycle.path).toEqual([candidate.recipeId, candidate.recipeId]);
  });

  it('null currentRecipeId returns ok regardless of candidate edges', () => {
    const b = makePromotedRecipe(db, 'recipe-b', yieldIngId);
    const ast = makeCandidateAst([{ recipeRef: b.recipeId, index: 1, line: 3 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: null });
    expect(result.ok).toBe(true);
  });

  it('no recipe-refs returns ok without walking', () => {
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    const ast: ResolvedRecipeAst = {
      header: { slug: 'candidate', title: 'Candidate' },
      yield: {
        yieldIngredientId: yieldIngId,
        yieldVariantId: null,
        yieldPrepStateId: null,
        yieldQty: 1,
        yieldUnit: 'count',
      },
      blocks: [],
    };
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(true);
  });

  it('first found: candidate has two recipe-refs, one cycles, one does not — reports the cycle', () => {
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    const cycling = makePromotedRecipe(db, 'cycling', yieldIngId);
    const safe = makePromotedRecipe(db, 'safe', yieldIngId);
    addRecipeRef(raw, cycling.versionId, candidate.recipeId);
    const ast = makeCandidateAst([
      { recipeRef: safe.recipeId, index: 1, line: 5 },
      { recipeRef: cycling.recipeId, index: 2, line: 8 },
    ]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cycle.path).toContain(cycling.recipeId);
  });

  it('path slugs include human-readable names in walk order', () => {
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    const b = makePromotedRecipe(db, 'recipe-b', yieldIngId);
    addRecipeRef(raw, b.versionId, candidate.recipeId);
    const ast = makeCandidateAst([{ recipeRef: b.recipeId, index: 1, line: 2 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    if (result.ok) throw new Error('expected cycle');
    expect(result.cycle.pathSlugs[0]).toBe('candidate');
    expect(result.cycle.pathSlugs).toContain('recipe-b');
    expect(result.cycle.pathSlugs[result.cycle.pathSlugs.length - 1]).toBe('candidate');
  });

  it('draft / unpromoted recipes are not in the live graph', () => {
    const candidate = makePromotedRecipe(db, 'candidate', yieldIngId);
    // B is created but NOT promoted — current_version_id stays null on the recipes row.
    const { recipe: b, version: bVersion } = createRecipe(db, {
      slug: 'draft-b',
      firstVersion: { title: 'Draft B', bodyDsl: '@recipe(draft-b)' },
    });
    // Add a recipe_line on the draft version that WOULD cycle if it were live.
    addRecipeRef(raw, bVersion.id, candidate.recipeId);
    const ast = makeCandidateAst([{ recipeRef: b.id, index: 1, line: 4 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(true);
  });
});
