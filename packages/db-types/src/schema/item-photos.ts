import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { homeInventory } from './inventory.js';

export const itemPhotos = sqliteTable(
  'item_photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id')
      .notNull()
      .references(() => homeInventory.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_item_photos_item').on(table.itemId)]
);
