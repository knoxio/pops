import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const mediaWatchlist = sqliteTable(
  'watchlist',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaType: text('media_type', { enum: ['movie', 'tv_show'] }).notNull(),
    mediaId: integer('media_id').notNull(),
    priority: integer('priority').default(0),
    notes: text('notes'),
    addedAt: text('added_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    source: text('source').notNull().default('manual'),
    plexRatingKey: text('plex_rating_key'),
  },
  (table) => [uniqueIndex('idx_watchlist_media').on(table.mediaType, table.mediaId)]
);
