import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const budgets = sqliteTable('budgets', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  notionId: text('notion_id').unique(),
  category: text('category').notNull(),
  // NOTE: schema.ts defines period as NOT NULL, but the actual DB (and test fixtures)
  // allow NULL periods. Service code treats period as nullable. Drizzle schema matches
  // runtime behavior, not the stricter schema.ts definition.
  period: text('period'),
  amount: real('amount'),
  active: integer('active').notNull().default(1),
  notes: text('notes'),
  lastEditedTime: text('last_edited_time').notNull(),
});
