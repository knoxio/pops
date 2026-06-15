import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const entities = sqliteTable('entities', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  notionId: text('notion_id').unique(),
  name: text('name').notNull(),
  type: text('type').notNull().default('company'),
  abn: text('abn'),
  aliases: text('aliases'),
  defaultTransactionType: text('default_transaction_type'),
  defaultTags: text('default_tags'),
  notes: text('notes'),
  lastEditedTime: text('last_edited_time').notNull(),
});
