/**
 * Invariant tests — exercises the plan_slots + plan_entries schema and the
 * service layer against an in-memory SQLite seeded with the food migrations.
 *
 * This suite seeds its own minimal `plan_slots` vocabulary so the FK can be
 * exercised in isolation from the runtime default-slot seed.
 */

import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  PlanEntryHasCookEvent,
  PlanEntryNotFound,
  PlanSlotInUse,
  PlanSlotIsDefault,
  PlanSlotNotFound,
  PlanSlotSlugAlreadyExists,
} from '../errors.js';
import { openFoodDb } from '../open-food-db.js';
import { planEntries, planSlots } from '../schema.js';
import {
  addCustomSlot,
  addPlanEntry,
  addSlot,
  deleteSlot,
  listSlots,
  removePlanEntry,
  reorderSlot,
  updateSlot,
} from '../services/plan.js';
import { createRun } from '../services/recipe-runs.js';
import { createRecipe } from '../services/recipes.js';

import type Database from 'better-sqlite3';

import type { FoodDb } from '../services/internal.js';

const DEFAULT_SLOTS = [
  { slug: 'breakfast', name: 'Breakfast', displayOrder: 10 },
  { slug: 'lunch', name: 'Lunch', displayOrder: 20 },
  { slug: 'dinner', name: 'Dinner', displayOrder: 30 },
  { slug: 'snack', name: 'Snack', displayOrder: 40 },
  { slug: 'prep-session', name: 'Prep session', displayOrder: 50 },
] as const;

function freshDb(): { db: FoodDb; raw: Database.Database } {
  const opened = openFoodDb(':memory:');
  // Mirror the runtime default-slot seed so these tests run standalone.
  for (const slot of DEFAULT_SLOTS) {
    opened.db
      .insert(planSlots)
      .values({
        slug: slot.slug,
        name: slot.name,
        displayOrder: slot.displayOrder,
        isDefault: 1,
      })
      .run();
  }
  return opened;
}

function makeRecipe(db: FoodDb, slug = 'smash-burger'): number {
  const { recipe } = createRecipe(db, {
    slug,
    firstVersion: { title: 'Smash burger', bodyDsl: '@recipe(' + slug + ')' },
  });
  return recipe.id;
}

function makeRecipeRun(db: FoodDb, slug = 'smash-burger'): { recipeId: number; runId: number } {
  const { recipe, version } = createRecipe(db, {
    slug,
    firstVersion: { title: 'Smash burger', bodyDsl: '@recipe(' + slug + ')' },
  });
  const run = createRun(db, { recipeVersionId: version.id });
  return { recipeId: recipe.id, runId: run.id };
}

describe('plan_slots + plan_entries', () => {
  let db: FoodDb;
  let raw: Database.Database;

  beforeEach(() => {
    ({ db, raw } = freshDb());
  });

  describe('schema applied cleanly', () => {
    it('creates plan_slots and plan_entries tables', () => {
      const tables = raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['plan_slots', 'plan_entries']));
    });

    it('creates all four plan_entries indexes including the partial one', () => {
      const idx = raw
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='plan_entries'`
        )
        .all() as { name: string; sql: string | null }[];
      const names = idx.map((i) => i.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'idx_plan_entries_date',
          'idx_plan_entries_date_slot',
          'idx_plan_entries_recipe',
          'idx_plan_entries_unscheduled',
        ])
      );
      const partial = idx.find((i) => i.name === 'idx_plan_entries_unscheduled');
      expect(partial?.sql).toMatch(/WHERE.*recipe_run_id.*IS NULL/i);
    });
  });

  describe('CHECK + FK invariants', () => {
    it('CHECK rejects planned_servings = 0', () => {
      const recipeId = makeRecipe(db);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO plan_entries (date, slot, recipe_id, planned_servings) VALUES (?, ?, ?, 0)`
          )
          .run('2026-06-09', 'dinner', recipeId)
      ).toThrow();
    });

    it('FK rejects slot="nonexistent"', () => {
      const recipeId = makeRecipe(db);
      expect(() =>
        addPlanEntry(db, { date: '2026-06-09', slot: 'made-up-slot', recipeId })
      ).toThrow();
    });

    it('FK rejects recipe_id referencing a deleted recipe', () => {
      const recipeId = makeRecipe(db);
      addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId });
      // Deleting the recipe row underneath the plan_entries row triggers the FK.
      expect(() => raw.prepare(`DELETE FROM recipes WHERE id=?`).run(recipeId)).toThrow();
    });
  });

  describe('multi-recipe-per-slot', () => {
    it('allows multiple entries sharing (date, slot) and orders them by position', () => {
      const r1 = makeRecipe(db, 'starter');
      const r2 = makeRecipe(db, 'main');
      const r3 = makeRecipe(db, 'dessert');
      const e1 = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId: r1 });
      const e2 = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId: r2 });
      const e3 = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId: r3 });
      expect([e1.position, e2.position, e3.position]).toEqual([0, 1, 2]);
      const rows = db
        .select()
        .from(planEntries)
        .where(eq(planEntries.slot, 'dinner'))
        .orderBy(asc(planEntries.position))
        .all();
      expect(rows.map((r) => r.recipeId)).toEqual([r1, r2, r3]);
    });

    it('reorderSlot reassigns positions in caller-supplied order', () => {
      const r1 = makeRecipe(db, 'starter');
      const r2 = makeRecipe(db, 'main');
      const e1 = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId: r1 });
      const e2 = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId: r2 });
      reorderSlot(db, [e2.id, e1.id]);
      const rows = db
        .select()
        .from(planEntries)
        .where(eq(planEntries.slot, 'dinner'))
        .orderBy(asc(planEntries.position))
        .all();
      expect(rows.map((r) => r.id)).toEqual([e2.id, e1.id]);
    });
  });

  describe('removePlanEntry', () => {
    it('throws PlanEntryNotFound for an unknown id', () => {
      expect(() => removePlanEntry(db, 9999)).toThrow(PlanEntryNotFound);
    });

    it('refuses deletion when recipe_run_id is set', () => {
      const { recipeId, runId } = makeRecipeRun(db);
      const entry = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId });
      db.update(planEntries).set({ recipeRunId: runId }).where(eq(planEntries.id, entry.id)).run();
      expect(() => removePlanEntry(db, entry.id)).toThrow(PlanEntryHasCookEvent);
    });

    it('FK rejects recipe_run_id referencing a nonexistent recipe_runs row', () => {
      const recipeId = makeRecipe(db);
      const entry = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId });
      expect(() =>
        db.update(planEntries).set({ recipeRunId: 9999 }).where(eq(planEntries.id, entry.id)).run()
      ).toThrow();
    });

    it('hard-deletes when recipe_run_id is null', () => {
      const recipeId = makeRecipe(db);
      const entry = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId });
      removePlanEntry(db, entry.id);
      expect(db.select().from(planEntries).where(eq(planEntries.id, entry.id)).all()).toHaveLength(
        0
      );
    });
  });

  describe('plan_slots vocabulary', () => {
    it('addSlot inserts an is_default=0 row', () => {
      const slot = addSlot(db, { slug: 'elevenses', name: 'Elevenses' });
      expect(slot.isDefault).toBe(0);
      expect(slot.displayOrder).toBe(100);
    });

    it('addCustomSlot is an alias for addSlot', () => {
      const slot = addCustomSlot(db, { slug: 'brunch', name: 'Brunch' });
      expect(slot.slug).toBe('brunch');
    });

    it('addSlot throws PlanSlotSlugAlreadyExists on a duplicate', () => {
      addSlot(db, { slug: 'elevenses', name: 'Elevenses' });
      expect(() => addSlot(db, { slug: 'elevenses', name: 'Elevenses #2' })).toThrow(
        PlanSlotSlugAlreadyExists
      );
    });

    it('addSlot rejects an invalid slug shape', () => {
      expect(() => addSlot(db, { slug: 'Elevenses!', name: 'Elevenses' })).toThrow();
    });

    it('updateSlot patches name and displayOrder', () => {
      addSlot(db, { slug: 'elevenses', name: 'Elevenses' });
      const updated = updateSlot(db, 'elevenses', { name: 'Late breakfast', displayOrder: 15 });
      expect(updated.name).toBe('Late breakfast');
      expect(updated.displayOrder).toBe(15);
    });

    it('updateSlot throws PlanSlotNotFound on an unknown slug', () => {
      expect(() => updateSlot(db, 'no-such-slot', { name: 'X' })).toThrow(PlanSlotNotFound);
    });

    it('deleteSlot refuses a seeded default', () => {
      expect(() => deleteSlot(db, 'breakfast')).toThrow(PlanSlotIsDefault);
    });

    it('deleteSlot refuses a slug that any plan_entries row references', () => {
      addSlot(db, { slug: 'elevenses', name: 'Elevenses' });
      const recipeId = makeRecipe(db);
      addPlanEntry(db, { date: '2026-06-09', slot: 'elevenses', recipeId });
      expect(() => deleteSlot(db, 'elevenses')).toThrow(PlanSlotInUse);
    });

    it('deleteSlot removes an unused custom slot', () => {
      addSlot(db, { slug: 'elevenses', name: 'Elevenses' });
      deleteSlot(db, 'elevenses');
      expect(db.select().from(planSlots).where(eq(planSlots.slug, 'elevenses')).all()).toHaveLength(
        0
      );
    });

    it('deleteSlot throws PlanSlotNotFound on an unknown slug', () => {
      expect(() => deleteSlot(db, 'no-such-slot')).toThrow(PlanSlotNotFound);
    });

    it('listSlots orders by display_order asc, then slug as tiebreaker', () => {
      // Two new slots tied at display_order = 25 — slug breaks the tie.
      addSlot(db, { slug: 'second-breakfast', name: 'Second breakfast', displayOrder: 25 });
      addSlot(db, { slug: 'a-snack', name: 'A snack', displayOrder: 25 });
      const ordered = listSlots(db);
      // Defaults come first (10, 20). Then the two custom slots at 25 — slug
      // order is `a-snack` < `second-breakfast`. Then 30, 40, 50.
      const idx = (slug: string): number => ordered.findIndex((s) => s.slug === slug);
      expect(idx('a-snack')).toBeLessThan(idx('second-breakfast'));
      expect(idx('breakfast')).toBeLessThan(idx('a-snack'));
      expect(idx('dinner')).toBeGreaterThan(idx('second-breakfast'));
    });
  });

  describe('this week query (display ordering)', () => {
    it('returns rows in (date, ps.display_order, position) order', () => {
      const r = makeRecipe(db);
      // Tuesday dinner then Tuesday breakfast then Monday dinner —
      // canonical order should be Monday dinner < Tuesday breakfast < Tuesday dinner.
      const monDinner = addPlanEntry(db, { date: '2026-06-08', slot: 'dinner', recipeId: r });
      const tueDinner = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId: r });
      const tueBfast = addPlanEntry(db, { date: '2026-06-09', slot: 'breakfast', recipeId: r });

      const rows = raw
        .prepare(
          `SELECT pe.id, pe.date, pe.slot, ps.display_order, pe.position
             FROM plan_entries pe
             JOIN plan_slots ps ON ps.slug = pe.slot
            WHERE pe.date BETWEEN ? AND ?
            ORDER BY pe.date, ps.display_order, pe.position`
        )
        .all('2026-06-08', '2026-06-14') as { id: number }[];

      expect(rows.map((r2) => r2.id)).toEqual([monDinner.id, tueBfast.id, tueDinner.id]);
    });
  });

  describe('archived recipe references', () => {
    it('plan entry persists when the recipe is archived after planning', () => {
      const recipeId = makeRecipe(db);
      const entry = addPlanEntry(db, { date: '2026-06-09', slot: 'dinner', recipeId });
      raw.prepare(`UPDATE recipes SET archived_at=datetime('now') WHERE id=?`).run(recipeId);
      const rows = db.select().from(planEntries).where(eq(planEntries.id, entry.id)).all();
      expect(rows).toHaveLength(1);
    });
  });
});
