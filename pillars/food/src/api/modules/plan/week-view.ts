/**
 * `food.plan.weekView` read projection.
 *
 * Normalises an arbitrary YYYY-MM-DD to the containing ISO Monday, then
 * joins `plan_entries` with `recipes`, the resolved `recipe_versions`
 * (pinned id falls back to `recipes.current_version_id`), and
 * `recipe_runs.completed_at` to denormalise every cell-rendering field
 * into the wire row. One round-trip per week.
 */
import { and, asc, between, eq, sql } from 'drizzle-orm';

import {
  planEntries,
  planSlots,
  recipeRuns,
  recipes,
  recipeVersions,
  type FoodDb,
} from '../../../db/index.js';
import { toIsoMonday, isoDateAddDays } from './iso-week.js';

import type { WeekView, PlanEntryRow, PlanSlotRow } from '../../../domain/types/plan.js';

export function buildWeekView(db: FoodDb, weekStartInput: string): WeekView {
  const weekStart = toIsoMonday(weekStartInput);
  const weekEnd = isoDateAddDays(weekStart, 6);

  const slots = listWireSlots(db);
  const entries = listWireEntries(db, weekStart, weekEnd);

  return { weekStart, weekEnd, slots, entries };
}

export function listWireSlots(db: FoodDb): readonly PlanSlotRow[] {
  const rows = db
    .select()
    .from(planSlots)
    .orderBy(asc(planSlots.displayOrder), asc(planSlots.slug))
    .all();
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    displayOrder: r.displayOrder,
    isDefault: r.isDefault === 1,
  }));
}

function listWireEntries(db: FoodDb, weekStart: string, weekEnd: string): readonly PlanEntryRow[] {
  const resolvedVersionId = sql<
    number | null
  >`coalesce(${planEntries.recipeVersionId}, ${recipes.currentVersionId})`;

  const rows = db
    .select({
      id: planEntries.id,
      date: planEntries.date,
      slot: planEntries.slot,
      position: planEntries.position,
      recipeId: planEntries.recipeId,
      recipeSlug: recipes.slug,
      recipeTitle: sql<string>`coalesce(${recipeVersions.title}, ${recipes.slug})`,
      recipeType: recipes.recipeType,
      heroImagePath: recipes.heroImagePath,
      plannedServings: planEntries.plannedServings,
      pinnedVersionId: planEntries.recipeVersionId,
      resolvedVersionId,
      recipeRunId: planEntries.recipeRunId,
      recipeRunCookedAt: recipeRuns.completedAt,
      notes: planEntries.notes,
    })
    .from(planEntries)
    .innerJoin(recipes, eq(recipes.id, planEntries.recipeId))
    .leftJoin(recipeVersions, eq(recipeVersions.id, resolvedVersionId))
    .leftJoin(recipeRuns, eq(recipeRuns.id, planEntries.recipeRunId))
    .where(and(between(planEntries.date, weekStart, weekEnd)))
    .orderBy(
      asc(planEntries.date),
      asc(planEntries.slot),
      asc(planEntries.position),
      asc(planEntries.id)
    )
    .all();

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    slot: r.slot,
    position: r.position,
    recipeId: r.recipeId,
    recipeSlug: r.recipeSlug,
    recipeTitle: r.recipeTitle,
    recipeType: r.recipeType ?? null,
    heroImagePath: r.heroImagePath,
    plannedServings: r.plannedServings,
    recipeVersionId: r.pinnedVersionId,
    recipeRunId: r.recipeRunId,
    recipeRunCookedAt: r.recipeRunCookedAt,
    notes: r.notes,
  }));
}
