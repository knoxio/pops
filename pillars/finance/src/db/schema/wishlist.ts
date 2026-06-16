import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const wishList = sqliteTable('wish_list', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  notionId: text('notion_id').unique(),
  item: text('item').notNull(),
  targetAmount: real('target_amount'),
  saved: real('saved'),
  priority: text('priority'),
  url: text('url'),
  notes: text('notes'),
  lastEditedTime: text('last_edited_time').notNull(),
});
