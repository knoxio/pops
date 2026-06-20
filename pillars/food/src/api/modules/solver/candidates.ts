/**
 * Pre-filter the recipe candidate set for `food.solver.canICook` —
 * PRD-150.
 *
 * Eligibility = non-archived recipe with a `current_version_id`
 * pointing at a `compiled` version. Optional client filters
 * (`recipeTypes`, `tags`, `maxMinutes`) are applied in SQL so the
 * downstream line walker only sees real candidates.
 *
 * `lastCookedAt` is the MAX `recipe_runs.completed_at` across every
 * version of the recipe (left join — recipes never cooked yield NULL).
 */
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import { recipeRuns, recipeTags, recipeVersions, recipes, type FoodDb } from '../../../db/index.js';

import type { CanICookInput } from './inputs.js';
import type { RecipeTypeLiteral } from './types.js';

export interface CandidateRecipe {
  recipeId: number;
  recipeSlug: string;
  title: string;
  recipeType: RecipeTypeLiteral | null;
  heroImagePath: string | null;
  recipeVersionId: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  lastCookedAt: string | null;
}

function maxTimeCondition(maxMinutes: number): SQL {
  const prep = sql<number>`COALESCE(${recipeVersions.prepMinutes}, 0)`;
  const cook = sql<number>`COALESCE(${recipeVersions.cookMinutes}, 0)`;
  const cond = sql<boolean>`(${prep} + ${cook} <= ${maxMinutes}) OR (${recipeVersions.prepMinutes} IS NULL AND ${recipeVersions.cookMinutes} IS NULL)`;
  return cond;
}

function buildWhere(input: CanICookInput): SQL {
  const conds: SQL[] = [
    isNull(recipes.archivedAt),
    isNotNull(recipes.currentVersionId),
    eq(recipeVersions.compileStatus, 'compiled'),
  ];
  if (input.recipeTypes !== undefined && input.recipeTypes.length > 0) {
    conds.push(inArray(recipes.recipeType, input.recipeTypes));
  }
  if (input.maxMinutes !== undefined) {
    conds.push(maxTimeCondition(input.maxMinutes));
  }
  const where = and(...conds);
  if (where === undefined) throw new Error('candidate WHERE assembly failed');
  return where;
}

function applyTagsFilter(
  db: FoodDb,
  pool: readonly CandidateRecipe[],
  required: readonly string[]
): CandidateRecipe[] {
  if (pool.length === 0) return [];
  const ids = pool.map((row) => row.recipeId);
  const matchRows = db
    .select({ recipeId: recipeTags.recipeId })
    .from(recipeTags)
    .where(and(inArray(recipeTags.recipeId, ids), inArray(recipeTags.tag, required)))
    .groupBy(recipeTags.recipeId)
    .having(sql`COUNT(DISTINCT ${recipeTags.tag}) = ${required.length}`)
    .all();
  const keep = new Set<number>();
  for (const row of matchRows) keep.add(row.recipeId);
  return pool.filter((row) => keep.has(row.recipeId));
}

/** Load + filter the candidate recipe set ahead of the line walker. */
export function preFilterCandidates(db: FoodDb, input: CanICookInput): CandidateRecipe[] {
  const where = buildWhere(input);
  const rows = db
    .select({
      recipeId: recipes.id,
      recipeSlug: recipes.slug,
      title: recipeVersions.title,
      recipeType: recipes.recipeType,
      heroImagePath: recipes.heroImagePath,
      recipeVersionId: recipeVersions.id,
      prepMinutes: recipeVersions.prepMinutes,
      cookMinutes: recipeVersions.cookMinutes,
    })
    .from(recipes)
    .innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
    .where(where)
    .orderBy(asc(recipes.slug))
    .all();
  if (rows.length === 0) return [];
  const lastCookedAt = loadLastCookedAt(
    db,
    rows.map((r) => r.recipeId)
  );
  const enriched: CandidateRecipe[] = rows.map((row) => ({
    recipeId: row.recipeId,
    recipeSlug: row.recipeSlug,
    title: row.title,
    recipeType: row.recipeType,
    heroImagePath: row.heroImagePath,
    recipeVersionId: row.recipeVersionId,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    lastCookedAt: lastCookedAt.get(row.recipeId) ?? null,
  }));
  if (input.tags !== undefined && input.tags.length > 0) {
    return applyTagsFilter(db, enriched, input.tags);
  }
  return enriched;
}

function loadLastCookedAt(db: FoodDb, recipeIds: readonly number[]): Map<number, string> {
  if (recipeIds.length === 0) return new Map();
  const rows = db
    .select({
      recipeId: recipeVersions.recipeId,
      lastCookedAt: sql<string | null>`MAX(${recipeRuns.completedAt})`,
    })
    .from(recipeVersions)
    .innerJoin(recipeRuns, eq(recipeRuns.recipeVersionId, recipeVersions.id))
    .where(and(inArray(recipeVersions.recipeId, recipeIds), isNotNull(recipeRuns.completedAt)))
    .groupBy(recipeVersions.recipeId)
    .all();
  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.lastCookedAt !== null) map.set(row.recipeId, row.lastCookedAt);
  }
  return map;
}

/** Load recipe_tags for a recipe set; used by the line walker for context-tag matching. */
export function loadRecipeTagsMap(
  db: FoodDb,
  recipeIds: readonly number[]
): Map<number, readonly string[]> {
  if (recipeIds.length === 0) return new Map();
  const rows = db
    .select({ recipeId: recipeTags.recipeId, tag: recipeTags.tag })
    .from(recipeTags)
    .where(inArray(recipeTags.recipeId, recipeIds))
    .all();
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const bucket = map.get(row.recipeId);
    if (bucket === undefined) {
      map.set(row.recipeId, [row.tag]);
    } else {
      bucket.push(row.tag);
    }
  }
  return map;
}
