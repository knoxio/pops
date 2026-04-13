import { index, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { entities } from './entities.js';

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notionId: text('notion_id').unique(),
    description: text('description').notNull(),
    account: text('account').notNull(),
    amount: real('amount').notNull(),
    date: text('date').notNull(),
    type: text('type').notNull(),
    tags: text('tags').notNull().default('[]'),
    entityId: text('entity_id').references(() => entities.id, {
      onDelete: 'set null',
    }),
    entityName: text('entity_name'),
    location: text('location'),
    country: text('country'),
    relatedTransactionId: text('related_transaction_id'),
    notes: text('notes'),
    checksum: text('checksum'),
    rawRow: text('raw_row'),
    lastEditedTime: text('last_edited_time').notNull(),
  },
  (table) => [
    index('idx_transactions_date').on(table.date),
    index('idx_transactions_account').on(table.account),
    index('idx_transactions_entity').on(table.entityId),
    index('idx_transactions_last_edited').on(table.lastEditedTime),
    index('idx_transactions_notion_id').on(table.notionId),
    uniqueIndex('idx_transactions_checksum').on(table.checksum),
  ]
);
