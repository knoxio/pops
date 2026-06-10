/**
 * PRD-143 — integration tests for `food.plan.*`.
 *
 * Stands up the food migrations on in-memory SQLite, seeds default
 * slots + a single recipe (current + draft + archived versions), then
 * exercises every procedure including the discriminated-union error
 * paths declared in the PRD.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ingredientsService,
  prepStatesService,
  recipesService,
  recipeVersionsService,
  variantsService,
  planService,
} from '@pops/app-food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0061_shocking_skreet.sql',
  '0062_chemical_donald_blake.sql',
  '0063_bumpy_wolverine.sql',
  '0064_peaceful_magma.sql',
  '0065_prd_116_recipe_compile.sql',
  '0066_prd_123_conversions.sql',
];

function applyMigration(db: Database, filename: string): void {
  const raw = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of raw.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

function createFoodTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATION_FILES) applyMigration(db, name);
  return db;
}

interface Seed {
  pancakesId: number;
  pancakesVersionId: number;
  draftRecipeId: number;
  archivedRecipeId: number;
  draftVersionId: number;
}

function seed(): Seed {
  const db = getDrizzle();
  const banana = ingredientsService.createIngredient(db, {
    slug: 'banana',
    name: 'Banana',
    defaultUnit: 'count',
  });
  variantsService.createVariant(db, {
    ingredientId: banana.id,
    slug: 'raw',
    name: 'Raw',
    defaultUnit: 'count',
  });
  prepStatesService.createPrepState(db, { slug: 'mashed', name: 'Mashed' });

  const pancakes = recipesService.createRecipe(db, {
    slug: 'pancakes',
    recipeType: 'plate',
    firstVersion: {
      title: 'Banana pancakes',
      bodyDsl:
        '@recipe(slug="pancakes", title="Banana pancakes")\n@yield(banana, 1:count)\n@step("Mash, fry.")',
    },
  });
  db.run(
    sql`UPDATE recipe_versions SET compile_status = 'compiled', compiled_at = datetime('now') WHERE id = ${pancakes.version.id}`
  );
  recipeVersionsService.promoteVersion(db, pancakes.version.id);

  const draftRecipe = recipesService.createRecipe(db, {
    slug: 'soup',
    recipeType: 'plate',
    firstVersion: {
      title: 'Soup draft',
      bodyDsl: '@recipe(slug="soup", title="Soup draft")\n@yield(banana, 1:count)\n@step("Boil")',
    },
  });
  // Leave current_version_id NULL by clearing it after creation.
  db.run(sql`UPDATE recipes SET current_version_id = NULL WHERE id = ${draftRecipe.recipe.id}`);

  const archived = recipesService.createRecipe(db, {
    slug: 'old-toast',
    recipeType: 'plate',
    firstVersion: {
      title: 'Old toast',
      bodyDsl:
        '@recipe(slug="old-toast", title="Old toast")\n@yield(banana, 1:count)\n@step("Toast")',
    },
  });
  db.run(sql`UPDATE recipes SET archived_at = datetime('now') WHERE id = ${archived.recipe.id}`);

  // Seed default slots so the slot-CRUD procs have something to read.
  db.run(
    sql`INSERT INTO plan_slots (slug, name, display_order, is_default) VALUES
        ('breakfast', 'Breakfast', 10, 1),
        ('lunch', 'Lunch', 20, 1),
        ('dinner', 'Dinner', 30, 1),
        ('snack', 'Snack', 40, 1),
        ('prep-session', 'Prep session', 50, 1)`
  );

  return {
    pancakesId: pancakes.recipe.id,
    pancakesVersionId: pancakes.version.id,
    draftRecipeId: draftRecipe.recipe.id,
    archivedRecipeId: archived.recipe.id,
    draftVersionId: draftRecipe.version.id,
  };
}

describe('food.plan router — PRD-143', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;
  let s: Seed;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    s = seed();
    caller = createCaller();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  describe('weekView', () => {
    it('returns default slots and entries within the requested week, normalising to ISO Monday', async () => {
      const monday = '2026-06-15';
      planService.addPlanEntry(getDrizzle(), {
        date: monday,
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 2,
      });
      planService.addPlanEntry(getDrizzle(), {
        date: '2026-06-21',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });
      planService.addPlanEntry(getDrizzle(), {
        date: '2026-06-22',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });

      const wed = await caller.food.plan.weekView({ weekStart: '2026-06-17' });
      expect(wed.weekStart).toBe('2026-06-15');
      expect(wed.weekEnd).toBe('2026-06-21');
      expect(wed.slots.map((s) => s.slug)).toEqual([
        'breakfast',
        'lunch',
        'dinner',
        'snack',
        'prep-session',
      ]);
      expect(wed.slots[0]?.isDefault).toBe(true);
      expect(wed.entries.map((e) => e.date)).toEqual(['2026-06-15', '2026-06-21']);
      expect(wed.entries[0]?.recipeTitle).toBe('Banana pancakes');
      expect(wed.entries[0]?.recipeRunId).toBeNull();
    });

    it('rejects malformed weekStart with BAD_REQUEST', async () => {
      await expect(caller.food.plan.weekView({ weekStart: '2026-02-30' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  describe('addEntry', () => {
    it('inserts and reports the new id + position', async () => {
      const res = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 2,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.id).toBeGreaterThan(0);
        expect(res.position).toBe(0);
      }
    });

    it('rejects unknown slot with BadSlot', async () => {
      const res = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'midnight-snack',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });
      expect(res).toEqual({ ok: false, reason: 'BadSlot' });
    });

    it('rejects archived recipe with RecipeArchived', async () => {
      const res = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.archivedRecipeId,
        plannedServings: 1,
      });
      expect(res).toEqual({ ok: false, reason: 'RecipeArchived' });
    });

    it('rejects no-current-version recipe with RecipeHasNoCurrentVersion', async () => {
      const res = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.draftRecipeId,
        plannedServings: 1,
      });
      expect(res).toEqual({ ok: false, reason: 'RecipeHasNoCurrentVersion' });
    });

    it('allows pinning a draft version even when current_version_id is null', async () => {
      const res = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.draftRecipeId,
        recipeVersionId: s.draftVersionId,
        plannedServings: 1,
      });
      expect(res.ok).toBe(true);
    });
  });

  describe('updateEntry / moveEntry / deleteEntry', () => {
    it('updates servings and notes', async () => {
      const added = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 2,
      });
      if (!added.ok) throw new Error('add failed');
      const updated = await caller.food.plan.updateEntry({
        id: added.id,
        plannedServings: 4,
        notes: 'feeds family',
      });
      expect(updated).toEqual({ ok: true });
      const week = await caller.food.plan.weekView({ weekStart: '2026-06-15' });
      expect(week.entries[0]?.plannedServings).toBe(4);
      expect(week.entries[0]?.notes).toBe('feeds family');
    });

    it('moves an entry to a different (date, slot, position)', async () => {
      const added = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 2,
      });
      if (!added.ok) throw new Error('add failed');
      const moved = await caller.food.plan.moveEntry({
        id: added.id,
        date: '2026-06-17',
        slot: 'lunch',
      });
      expect(moved).toEqual({ ok: true });
      const week = await caller.food.plan.weekView({ weekStart: '2026-06-15' });
      expect(week.entries[0]?.date).toBe('2026-06-17');
      expect(week.entries[0]?.slot).toBe('lunch');
    });

    it('rejects mutations on a cooked entry with AlreadyCooked', async () => {
      const added = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 2,
      });
      if (!added.ok) throw new Error('add failed');
      // Simulate the cook flow setting recipe_run_id.
      getDrizzle().run(
        sql`INSERT INTO recipe_runs (recipe_version_id, scale_factor, started_at, completed_at)
            VALUES (${s.pancakesVersionId}, 1.0, datetime('now'), datetime('now'))`
      );
      const runRow = sqlite
        .prepare('SELECT id FROM recipe_runs ORDER BY id DESC LIMIT 1')
        .get() as { id: number };
      const runId = runRow.id;
      getDrizzle().run(
        sql`UPDATE plan_entries SET recipe_run_id = ${runId} WHERE id = ${added.id}`
      );

      const del = await caller.food.plan.deleteEntry({ id: added.id });
      expect(del).toEqual({ ok: false, reason: 'AlreadyCooked' });
      const move = await caller.food.plan.moveEntry({
        id: added.id,
        date: '2026-06-16',
        slot: 'dinner',
      });
      expect(move).toEqual({ ok: false, reason: 'AlreadyCooked' });
    });
  });

  describe('reorderSlot', () => {
    it('reorders ids belonging to the same (date, slot)', async () => {
      const a = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });
      const b = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });
      if (!a.ok || !b.ok) throw new Error('add failed');
      const res = await caller.food.plan.reorderSlot({
        date: '2026-06-15',
        slot: 'dinner',
        orderedIds: [b.id, a.id],
      });
      expect(res).toEqual({ ok: true });
      const week = await caller.food.plan.weekView({ weekStart: '2026-06-15' });
      expect(week.entries.map((e) => e.id)).toEqual([b.id, a.id]);
    });

    it('rejects ids from other cells with BadIds', async () => {
      const a = await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });
      const b = await caller.food.plan.addEntry({
        date: '2026-06-16',
        slot: 'dinner',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });
      if (!a.ok || !b.ok) throw new Error('add failed');
      const res = await caller.food.plan.reorderSlot({
        date: '2026-06-15',
        slot: 'dinner',
        orderedIds: [a.id, b.id],
      });
      expect(res).toEqual({ ok: false, reason: 'BadIds' });
    });
  });

  describe('slot CRUD', () => {
    it('lists default slots in display order with isDefault=true', async () => {
      const { slots } = await caller.food.plan.listSlots();
      expect(slots).toHaveLength(5);
      expect(slots[0]?.isDefault).toBe(true);
    });

    it('adds a custom slot then refuses to take the same slug again', async () => {
      const ok = await caller.food.plan.addSlot({ slug: 'late-night', name: 'Late night' });
      expect(ok).toEqual({ ok: true });
      const taken = await caller.food.plan.addSlot({ slug: 'late-night', name: 'Late night' });
      expect(taken).toEqual({ ok: false, reason: 'SlugTaken' });
    });

    it('refuses to rename default slots but reorders them', async () => {
      const rename = await caller.food.plan.updateSlot({ slug: 'dinner', name: 'Supper' });
      expect(rename).toEqual({ ok: false, reason: 'CannotEditDefault' });
      const reorder = await caller.food.plan.updateSlot({ slug: 'dinner', displayOrder: 5 });
      expect(reorder).toEqual({ ok: true });
    });

    it('refuses to delete a default slot and a slot in use', async () => {
      const defaultRes = await caller.food.plan.deleteSlot({ slug: 'dinner' });
      expect(defaultRes).toEqual({ ok: false, reason: 'CannotDeleteDefault' });

      await caller.food.plan.addSlot({ slug: 'late-night', name: 'Late night' });
      await caller.food.plan.addEntry({
        date: '2026-06-15',
        slot: 'late-night',
        recipeId: s.pancakesId,
        plannedServings: 1,
      });
      const inUse = await caller.food.plan.deleteSlot({ slug: 'late-night' });
      expect(inUse).toEqual({ ok: false, reason: 'SlotInUse' });
    });

    it('deletes an empty custom slot', async () => {
      await caller.food.plan.addSlot({ slug: 'late-night', name: 'Late night' });
      const res = await caller.food.plan.deleteSlot({ slug: 'late-night' });
      expect(res).toEqual({ ok: true });
    });
  });
});
