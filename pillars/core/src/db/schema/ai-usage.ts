import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aiUsage = sqliteTable(
  'ai_usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    description: text('description').notNull(),
    entityName: text('entity_name'),
    category: text('category'),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    costUsd: real('cost_usd').notNull(),
    cached: integer('cached').notNull().default(0),
    importBatchId: text('import_batch_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_ai_usage_created_at').on(table.createdAt),
    index('idx_ai_usage_batch').on(table.importBatchId),
  ]
);
