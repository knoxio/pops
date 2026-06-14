import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const syncLogs = sqliteTable('sync_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  syncedAt: text('synced_at').notNull(),
  moviesSynced: integer('movies_synced').notNull().default(0),
  tvShowsSynced: integer('tv_shows_synced').notNull().default(0),
  errors: text('errors'), // JSON array of error strings, null if none
  durationMs: integer('duration_ms'),
});
