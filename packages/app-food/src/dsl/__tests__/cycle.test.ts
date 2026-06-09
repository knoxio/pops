/**
 * PRD-117 — recipe-graph cycle detection invariants.
 *
 * The detector queries `recipe_lines` (PRD-116). Until that PRD lands, the
 * test suite creates the minimal subset of `recipe_lines` columns
 * (`recipe_version_id`, `recipe_ref_id`, `is_recipe_ref`) the detector
 * reads. When PRD-116's full schema arrives, the same queries continue to
 * work against the superset.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { recipeVersions } from '../../db/schema';
import { createIngredient } from '../../db/services/ingredients';
import { promoteVersion } from '../../db/services/recipe-versions';
import { createRecipe } from '../../db/services/recipes';
import { detectRecipeCycle } from '../cycle';

import type { FoodDb } from '../../db/services/internal';
import type { ResolvedIngredientBlock, ResolvedRecipeAst } from '../resolver-types';

const MIGRATIONS = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
].map((name) =>
  readFileSync(
    join(__dirname, '../../../../../apps/pops-api/src/db/drizzle-migrations', name),
    'utf8'
  )
);

// Minimal `recipe_lines` table from PRD-116, just the 3 columns the detector
// reads. PRD-116's migration will extend with the full column set.
const RECIPE_LINES_STUB = `
  CREATE TABLE recipe_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id),
    recipe_ref_id INTEGER REFERENCES recipes(id),
    is_recipe_ref INTEGER NOT NULL DEFAULT 0
  );
`;

function freshDb(): { db: FoodDb; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    const stmts = migration.split('--> statement-breakpoint');
    for (const stmt of stmts) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) raw.exec(trimmed);
    }
  }
  raw.exec(RECIPE_LINES_STUB);
  return { db: drizzle(raw), raw };
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

function addRecipeRef(raw: Database.Database, versionId: number, refRecipeId: number): void {
  raw
    .prepare(
      `INSERT INTO recipe_lines (recipe_version_id, recipe_ref_id, is_recipe_ref) VALUES (?, ?, 1)`
    )
    .run(versionId, refRecipeId);
}

function makeCandidateAst(
  refs: { recipeRef: number; index: number; line: number }[]
): ResolvedRecipeAst {
  return {
    header: {
      slug: 'candidate',
      title: 'Candidate',
    },
    yield: {
      yieldIngredientId: 1,
      yieldVariantId: null,
      yieldPrepStateId: null,
      yieldQty: 1,
      yieldUnit: 'count',
    },
    blocks: refs.map(
      (r): ResolvedIngredientBlock => ({
        kind: 'ingredient',
        index: r.index,
        ingredientId: 1,
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

describe('PRD-117 — recipe-graph cycle detection', () => {
  let db: FoodDb;
  let raw: Database.Database;
  let yieldIngId: number;

  beforeEach(() => {
    ({ db, raw } = freshDb());
    yieldIngId = createIngredient(db, {
      name: 'Yield',
      slug: 'common-yield',
      defaultUnit: 'count',
    }).id;
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
    // Candidate references B; B is draft → its refs don't count.
    const ast = makeCandidateAst([{ recipeRef: b.id, index: 1, line: 4 }]);
    const result = detectRecipeCycle(ast, { db, currentRecipeId: candidate.recipeId });
    expect(result.ok).toBe(true);
  });
});
