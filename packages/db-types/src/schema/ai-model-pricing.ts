import { integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const aiModelPricing = sqliteTable(
  'ai_model_pricing',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    displayName: text('display_name'),
    inputCostPerMtok: real('input_cost_per_mtok').notNull().default(0),
    outputCostPerMtok: real('output_cost_per_mtok').notNull().default(0),
    contextWindow: integer('context_window'),
    isDefault: integer('is_default').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [unique('uq_ai_model_pricing_provider_model').on(table.providerId, table.modelId)]
);
