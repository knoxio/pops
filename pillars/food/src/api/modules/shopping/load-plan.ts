/**
 * Plan-entry loader for the shopping generator.
 *
 * Selects `plan_entries` in the given date range whose `recipe_run_id IS
 * NULL` (already-cooked entries don't contribute — their batches are already
 * in the fridge), resolves each entry's effective `recipe_version_id` via
 * `COALESCE(pe.recipe_version_id, recipes.current_version_id)`, and skips
 * entries whose recipe has no current version.
 */
import { and, asc, between, eq, inArray, isNull } from 'drizzle-orm';

import { type FoodDb, planEntries, recipes, recipeVersions } from '../../../db/index.js';

export interface PlanEntryNeed {
  planEntryId: number;
  planDate: string;
  recipeId: number;
  recipeVersionId: number;
  recipeTitle: string;
  plannedServings: number;
  /** Null when the recipe version had no `servings` value — caller falls back to scale=1.0. */
  versionServings: number | null;
}

export interface LoadPlanResult {
  entries: PlanEntryNeed[];
  /** Plan entries in range whose recipe has no current version + no pin. */
  skippedCount: number;
  /** Total rows seen (entries.length + skippedCount). */
  rawCount: number;
}

export function loadPlanEntriesForRange(
  db: FoodDb,
  startDate: string,
  endDate: string
): LoadPlanResult {
  const rows = db
    .select({
      planEntryId: planEntries.id,
      planDate: planEntries.date,
      recipeId: planEntries.recipeId,
      pinnedVersionId: planEntries.recipeVersionId,
      currentVersionId: recipes.currentVersionId,
      plannedServings: planEntries.plannedServings,
    })
    .from(planEntries)
    .innerJoin(recipes, eq(recipes.id, planEntries.recipeId))
    .where(and(between(planEntries.date, startDate, endDate), isNull(planEntries.recipeRunId)))
    .orderBy(asc(planEntries.date), asc(planEntries.position), asc(planEntries.id))
    .all();

  const versionIds = collectVersionIds(rows);
  const versions = loadVersions(db, versionIds);

  const entries: PlanEntryNeed[] = [];
  let skipped = 0;
  for (const r of rows) {
    const versionId = r.pinnedVersionId ?? r.currentVersionId;
    if (versionId === null) {
      skipped += 1;
      continue;
    }
    const v = versions.get(versionId);
    if (v === undefined) {
      skipped += 1;
      continue;
    }
    entries.push({
      planEntryId: r.planEntryId,
      planDate: r.planDate,
      recipeId: r.recipeId,
      recipeVersionId: versionId,
      recipeTitle: v.title,
      plannedServings: r.plannedServings,
      versionServings: v.servings,
    });
  }
  return { entries, skippedCount: skipped, rawCount: rows.length };
}

function collectVersionIds(
  rows: readonly { pinnedVersionId: number | null; currentVersionId: number | null }[]
): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    const v = r.pinnedVersionId ?? r.currentVersionId;
    if (v !== null) set.add(v);
  }
  return [...set];
}

function loadVersions(
  db: FoodDb,
  ids: readonly number[]
): Map<number, { title: string; servings: number | null }> {
  const map = new Map<number, { title: string; servings: number | null }>();
  if (ids.length === 0) return map;
  const rows = db
    .select({
      id: recipeVersions.id,
      title: recipeVersions.title,
      servings: recipeVersions.servings,
    })
    .from(recipeVersions)
    .where(inArray(recipeVersions.id, [...ids]))
    .all();
  for (const r of rows) {
    map.set(r.id, { title: r.title, servings: r.servings });
  }
  return map;
}
