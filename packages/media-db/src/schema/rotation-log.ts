import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const rotationLog = sqliteTable('rotation_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  executedAt: text('executed_at').notNull(),
  moviesMarkedLeaving: integer('movies_marked_leaving').notNull(),
  moviesRemoved: integer('movies_removed').notNull(),
  moviesAdded: integer('movies_added').notNull(),
  removalsFailed: integer('removals_failed').notNull(),
  freeSpaceGb: real('free_space_gb').notNull(),
  targetFreeGb: real('target_free_gb').notNull(),
  skippedReason: text('skipped_reason'),
  details: text('details'), // JSON: movie titles/IDs for each action
});
