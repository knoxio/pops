/**
 * PRD-136 — inbox-rejection metadata per recipe version.
 *
 * Presence-of-row distinguishes an inbox reject (with a structured `reason`
 * and optional free-text `note`) from PRD-119's manual draft discard — both
 * land on `recipe_versions.status='archived'`, but only the former writes
 * here. `ON DELETE CASCADE` mirrors `recipe_version_proposed_slugs` so a
 * deleted recipe cascades through every version's review metadata.
 *
 * `reason` is constrained to a 5-value enum via a `ck_*` CHECK constraint
 * added in the migration (drizzle-kit doesn't emit `enum` CHECKs).
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { recipeVersions } from './food-recipes.js';

export const recipeVersionRejections = sqliteTable('recipe_version_rejections', {
  versionId: integer('version_id')
    .primaryKey()
    .references(() => recipeVersions.id, { onDelete: 'cascade' }),
  reason: text('reason', {
    enum: ['wrong-recipe', 'low-quality-extraction', 'duplicate', 'not-a-recipe', 'other'],
  }).notNull(),
  note: text('note'),
  rejectedAt: text('rejected_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type RecipeVersionRejectionRow = typeof recipeVersionRejections.$inferSelect;
export type RecipeVersionRejectionInsert = typeof recipeVersionRejections.$inferInsert;
