import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const shelfImpressions = sqliteTable(
  'shelf_impressions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    shelfId: text('shelf_id').notNull(),
    shownAt: text('shown_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_shelf_impressions_shelf_id').on(t.shelfId)]
);
