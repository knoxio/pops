/**
 * Seed step — plan_slots + plan_entries.
 *
 * Seeds the default slot vocabulary directly (bypassing `addSlot` because
 * the service forbids touching `is_default = 1` rows) plus the one
 * user-added slot, then adds the plan_entries via `addPlanEntry`.
 */
import { planSlots } from '../db/schema.js';
import { addPlanEntry } from '../db/services/plan.js';
import { PLAN_ENTRY_FIXTURES, PLAN_SLOT_FIXTURES, planDateForOffset } from './data-plan.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

function seedSlots(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of PLAN_SLOT_FIXTURES) {
    db.insert(planSlots)
      .values({
        slug: fixture.slug,
        name: fixture.name,
        displayOrder: fixture.displayOrder,
        isDefault: fixture.isDefault,
      })
      .run();
    ctx.planSlotBySlug.set(fixture.slug, { slug: fixture.slug, name: fixture.name });
  }
  return PLAN_SLOT_FIXTURES.length;
}

function seedEntries(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of PLAN_ENTRY_FIXTURES) {
    const recipeId = ctx.recipeIdBySlug.get(fixture.recipeSlug);
    if (recipeId === undefined) {
      throw new Error(`Plan entry refers to unknown recipe "${fixture.recipeSlug}"`);
    }
    const versionId = ctx.recipeVersionIdByRecipeSlug.get(fixture.recipeSlug) ?? null;
    addPlanEntry(db, {
      date: planDateForOffset(fixture.offsetDays),
      slot: fixture.slot,
      recipeId,
      recipeVersionId: versionId,
      plannedServings: fixture.plannedServings ?? 1,
      position: fixture.position,
      notes: fixture.notes ?? null,
    });
  }
  return PLAN_ENTRY_FIXTURES.length;
}

export function seedPlan(db: FoodDb, ctx: SeedContext): { planSlots: number; planEntries: number } {
  const slots = seedSlots(db, ctx);
  const entries = seedEntries(db, ctx);
  return { planSlots: slots, planEntries: entries };
}
