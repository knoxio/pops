/**
 * PRD-113 phase-2 — seed-driven cross-PRD compile smoke test.
 *
 * `seedFood` accepts a `compileRecipeVersion` callback. Production: the CLI
 * passes PRD-116's real implementation. This test does the same and asserts
 * the full compile path runs against the fixture set:
 *
 *   - every recipe ends up `compile_status='compiled'` and v1 is promoted to
 *     `current` (PRD-107 promote service)
 *   - `recipe_lines` and `recipe_steps` get populated per fixture
 *   - the smash-burger plate's compile honours PRD-115's recipe-as-ingredient
 *     resolution, with one `recipe_lines.is_recipe_ref=1` row pointing at
 *     smash-patty (whose currentVersionId was set moments before)
 *   - no `recipe_version_proposed_slugs` survive — auto-created yield slugs
 *     resolve cleanly on the recompile pass
 *   - cycle detection on smash-burger passes (no loops back into itself)
 *   - PRD-123 conversion seeds let `normaliseLineQty` resolve qty:unit pairs
 *     like `kg` → `g` and variant-specific `tsp` → `g`
 */

import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { openFoodDb } from '../../db/open-food-db.js';
import {
  ingredientWeights,
  recipeLines,
  recipeVersionProposedSlugs,
  recipeVersions,
  recipes,
  unitConversions,
} from '../../db/schema.js';
import { compileRecipeVersion } from '../../dsl/compile.js';
import { detectRecipeCycle } from '../../dsl/cycle.js';
import { parseRecipeDsl } from '../../dsl/parser.js';
import { resolveRecipeAst } from '../../dsl/resolver.js';
import { seedFood, type SeedFoodSummary } from '../index.js';

import type Database from 'better-sqlite3';

import type { FoodDb } from '../../db/services/internal.js';

function freshDb(): { db: FoodDb; raw: Database.Database } {
  return openFoodDb(':memory:');
}

function selectRecipeId(db: FoodDb, slug: string): number {
  const rows = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, slug)).all();
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`recipe "${slug}" not in seed`);
  return id;
}

describe('PRD-113 phase-2 — seed + compile smoke', () => {
  let db: FoodDb;
  let raw: Database.Database;
  let summary: SeedFoodSummary;

  // The seed is deterministic and every assertion below is read-only, so a
  // single rebuild keeps the test suite light — important because the
  // compile path drives 5 transactions through better-sqlite3 in series and
  // running it per-`it` would dominate the wall-clock budget for the whole
  // package's parallel vitest pool.
  beforeAll(() => {
    ({ db, raw } = freshDb());
    summary = seedFood(db, { compileRecipeVersion });
  });

  describe('summary + counts', () => {
    it('returns non-skipped summary and seeds the required Phase-2 fixtures', () => {
      // Assert by slug rather than exact count so adding a sample recipe in a
      // later phase doesn't false-fail this test — the invariant we care
      // about is "Phase-2 compile works for every seeded fixture", not the
      // fixture count itself.
      expect(summary.skipped).toBe(false);
      const REQUIRED_SLUGS = [
        'smash-patty',
        'smash-burger',
        'weeknight-pasta',
        'roast-chicken',
        'breakfast-eggs',
      ] as const;
      const seededSlugs = db.select({ slug: recipes.slug }).from(recipes).all();
      const slugSet = new Set(seededSlugs.map((row) => row.slug));
      for (const slug of REQUIRED_SLUGS) {
        expect(slugSet.has(slug), `recipe "${slug}" missing from seed`).toBe(true);
      }
      expect(summary.recipes).toBe(seededSlugs.length);
      expect(summary.recipes).toBeGreaterThanOrEqual(REQUIRED_SLUGS.length);
    });

    it('seeds PRD-123 conversion rows alongside the recipes', () => {
      const ucRows = db
        .select({ n: sql<number>`count(*)` })
        .from(unitConversions)
        .all();
      const iwRows = db
        .select({ n: sql<number>`count(*)` })
        .from(ingredientWeights)
        .all();
      expect(ucRows[0]?.n ?? 0).toBe(summary.unitConversions);
      expect(iwRows[0]?.n ?? 0).toBe(summary.ingredientWeights);
      expect(summary.unitConversions).toBeGreaterThanOrEqual(10);
      expect(summary.ingredientWeights).toBeGreaterThanOrEqual(4);
    });

    it('marks every seeded conversion row isSeeded=true (protected from delete)', () => {
      const ucUnseeded = db
        .select({ n: sql<number>`count(*)` })
        .from(unitConversions)
        .where(eq(unitConversions.isSeeded, 0))
        .all();
      const iwUnseeded = db
        .select({ n: sql<number>`count(*)` })
        .from(ingredientWeights)
        .where(eq(ingredientWeights.isSeeded, 0))
        .all();
      expect(ucUnseeded[0]?.n ?? 0).toBe(0);
      expect(iwUnseeded[0]?.n ?? 0).toBe(0);
    });
  });

  describe('recipe compile state', () => {
    it('compiles every fixture and promotes v1 to current', () => {
      const rows = db
        .select({
          slug: recipes.slug,
          currentVersionId: recipes.currentVersionId,
          compileStatus: recipeVersions.compileStatus,
          status: recipeVersions.status,
          yieldIngredientId: recipeVersions.yieldIngredientId,
        })
        .from(recipes)
        .innerJoin(recipeVersions, eq(recipeVersions.recipeId, recipes.id))
        .all();
      expect(rows.length).toBe(summary.recipes);
      for (const row of rows) {
        expect(row.currentVersionId, `recipe "${row.slug}" was not promoted`).not.toBeNull();
        expect(row.compileStatus, `recipe "${row.slug}" did not compile`).toBe('compiled');
        expect(row.status).toBe('current');
        expect(
          row.yieldIngredientId,
          `recipe "${row.slug}" did not capture a yield ingredient`
        ).not.toBeNull();
      }
    });

    it('materialises recipe_lines for every fixture', () => {
      const rows = raw
        .prepare(
          `SELECT r.slug, COUNT(rl.id) AS n
             FROM recipes r JOIN recipe_versions v ON v.id = r.current_version_id
             LEFT JOIN recipe_lines rl ON rl.recipe_version_id = v.id
             GROUP BY r.slug`
        )
        .all() as { slug: string; n: number }[];
      for (const row of rows) {
        expect(row.n, `recipe "${row.slug}" materialised 0 lines`).toBeGreaterThan(0);
      }
    });

    it('materialises recipe_steps for every fixture', () => {
      const rows = raw
        .prepare(
          `SELECT r.slug, COUNT(rs.id) AS n
             FROM recipes r JOIN recipe_versions v ON v.id = r.current_version_id
             LEFT JOIN recipe_steps rs ON rs.recipe_version_id = v.id
             GROUP BY r.slug`
        )
        .all() as { slug: string; n: number }[];
      for (const row of rows) {
        expect(row.n, `recipe "${row.slug}" materialised 0 steps`).toBeGreaterThan(0);
      }
    });

    it('leaves no proposed_slugs after compile (every auto-create resolved)', () => {
      const orphans = db
        .select({ n: sql<number>`count(*)` })
        .from(recipeVersionProposedSlugs)
        .all();
      expect(orphans[0]?.n ?? 0).toBe(0);
    });
  });

  describe('recipe-as-ingredient (PRD-115)', () => {
    it('smash-burger has one recipe_lines row pointing at smash-patty', () => {
      const burgerId = selectRecipeId(db, 'smash-burger');
      const pattyId = selectRecipeId(db, 'smash-patty');
      const versionRow = db
        .select({ id: recipes.currentVersionId })
        .from(recipes)
        .where(eq(recipes.id, burgerId))
        .all()[0];
      const versionId = versionRow?.id;
      expect(versionId, 'smash-burger has no current_version_id').not.toBeNull();
      const refs = db
        .select({
          recipeRefId: recipeLines.recipeRefId,
          isRecipeRef: recipeLines.isRecipeRef,
        })
        .from(recipeLines)
        .where(
          and(eq(recipeLines.recipeVersionId, versionId as number), eq(recipeLines.isRecipeRef, 1))
        )
        .all();
      expect(refs.length).toBe(1);
      expect(refs[0]?.recipeRefId).toBe(pattyId);
    });
  });

  describe('cycle detection (PRD-117)', () => {
    it('smash-burger has no recipe cycle', () => {
      const burgerId = selectRecipeId(db, 'smash-burger');
      const versionRow = db
        .select({ bodyDsl: recipeVersions.bodyDsl })
        .from(recipeVersions)
        .where(eq(recipeVersions.recipeId, burgerId))
        .all()[0];
      const bodyDsl = versionRow?.bodyDsl;
      expect(bodyDsl).toBeDefined();
      const parsed = parseRecipeDsl(bodyDsl as string);
      expect(parsed.ok, 'smash-burger DSL re-parse failed').toBe(true);
      if (!parsed.ok) return;
      const resolved = resolveRecipeAst(parsed.ast, { db, currentRecipeId: burgerId });
      expect(resolved.ok, 'smash-burger DSL re-resolve failed').toBe(true);
      if (!resolved.ok) return;
      const cycle = detectRecipeCycle(resolved.resolved, {
        db,
        currentRecipeId: burgerId,
      });
      expect(cycle.ok).toBe(true);
    });
  });
});
