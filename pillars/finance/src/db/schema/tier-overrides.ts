import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tierOverrides = sqliteTable(
  'tier_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaType: text('media_type').notNull(),
    mediaId: integer('media_id').notNull(),
    dimensionId: integer('dimension_id').notNull(),
    tier: text('tier').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_tier_overrides_unique').on(table.mediaType, table.mediaId, table.dimensionId),
  ]
);
