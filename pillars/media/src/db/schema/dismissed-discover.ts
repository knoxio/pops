import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const dismissedDiscover = sqliteTable('dismissed_discover', {
  tmdbId: integer('tmdb_id').primaryKey(),
  dismissedAt: text('dismissed_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
