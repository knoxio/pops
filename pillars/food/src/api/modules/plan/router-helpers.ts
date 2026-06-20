/**
 * Helpers used by `food.plan.*` mutation procedures — separated so
 * `router.ts` stays under the per-file line cap.
 */
import { and, eq, sql } from 'drizzle-orm';

import { planEntries, recipes, recipeVersions, type FoodDb } from '../../../db/index.js';
import { listWireSlots } from './week-view.js';

import type { PlanEntryError, PlanEntryMutationResult } from '../../../domain/types/plan.js';

type FailResult = { ok: false; reason: PlanEntryError };

export function planEntryFail(reason: PlanEntryError): FailResult {
  return { ok: false, reason };
}

export interface PlanEntryGuardRow {
  id: number;
  recipeId: number;
  recipeVersionId: number | null;
  recipeRunId: number | null;
}

export function planEntryById(db: FoodDb, id: number): PlanEntryGuardRow | null {
  const rows = db
    .select({
      id: planEntries.id,
      recipeId: planEntries.recipeId,
      recipeVersionId: planEntries.recipeVersionId,
      recipeRunId: planEntries.recipeRunId,
    })
    .from(planEntries)
    .where(eq(planEntries.id, id))
    .all();
  return rows[0] ?? null;
}

export function slotExists(db: FoodDb, slug: string): boolean {
  return listWireSlots(db).some((s) => s.slug === slug);
}

export function nextPositionForSlot(db: FoodDb, date: string, slot: string): number {
  const rows = db
    .select({ max: sql<number | null>`max(${planEntries.position})` })
    .from(planEntries)
    .where(and(eq(planEntries.date, date), eq(planEntries.slot, slot)))
    .all();
  const max = rows[0]?.max;
  return max === null || max === undefined ? 0 : max + 1;
}

export function recipeGuard(
  db: FoodDb,
  recipeId: number,
  pinnedVersionId: number | null
): FailResult | null {
  const rows = db
    .select({
      id: recipes.id,
      archivedAt: recipes.archivedAt,
      currentVersionId: recipes.currentVersionId,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .all();
  const recipe = rows[0];
  if (recipe === undefined) return planEntryFail('NotFound');
  if (recipe.archivedAt !== null) return planEntryFail('RecipeArchived');
  if (pinnedVersionId !== null) {
    const versionRows = db
      .select({ id: recipeVersions.id, recipeId: recipeVersions.recipeId })
      .from(recipeVersions)
      .where(eq(recipeVersions.id, pinnedVersionId))
      .all();
    const version = versionRows[0];
    if (version === undefined || version.recipeId !== recipeId) return planEntryFail('NotFound');
    return null;
  }
  if (recipe.currentVersionId === null) return planEntryFail('RecipeHasNoCurrentVersion');
  return null;
}

export type PlanEntryFailHelpers = {
  planEntryFail: (reason: PlanEntryError) => FailResult;
};

export type PlanEntryMutationOk = PlanEntryMutationResult & { ok: true };
