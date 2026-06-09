/**
 *   plan_slots    — extensible slot vocabulary (breakfast / lunch / dinner /
 *                   snack / prep-session by default; users can append).
 *   plan_entries  — one row per planned cook (date, slot, recipe).
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { recipeRuns } from './food-batches.js';
import { recipes, recipeVersions } from './food-recipes.js';

export const planSlots = sqliteTable('plan_slots', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(100),
  // SQLite booleans are integers. `1` flags seeded defaults so the seed
  // re-runner skips them and the service refuses to delete them.
  isDefault: integer('is_default').notNull().default(0),
});

export const planEntries = sqliteTable(
  'plan_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // ISO date — YYYY-MM-DD. Range queries pivot on this column.
    date: text('date').notNull(),
    slot: text('slot')
      .notNull()
      .references(() => planSlots.slug),
    position: integer('position').notNull().default(0),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id),
    // Null = use the recipe's current_version_id at cook time.
    recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id),
    plannedServings: integer('planned_servings').notNull().default(1),
    // Nullable until the entry transitions from "planned" to "cooked" — set
    // by the cook flow when a `recipe_runs` row is created.
    recipeRunId: integer('recipe_run_id').references(() => recipeRuns.id),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    check('ck_plan_entries_planned_servings', sql`${t.plannedServings} > 0`),
    index('idx_plan_entries_date').on(t.date),
    index('idx_plan_entries_date_slot').on(t.date, t.slot),
    index('idx_plan_entries_recipe').on(t.recipeId),
    // Partial index — drizzle-kit can't express the `WHERE recipe_run_id IS NULL`
    // clause; the migration is hand-edited to add it.
    index('idx_plan_entries_unscheduled').on(t.recipeId),
  ]
);
