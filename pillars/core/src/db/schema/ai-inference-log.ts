import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aiInferenceLog = sqliteTable(
  'ai_inference_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    domain: text('domain'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    status: text('status').notNull().default('success'),
    cached: integer('cached').notNull().default(0),
    contextId: text('context_id'),
    errorMessage: text('error_message'),
    metadata: text('metadata'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_ai_inference_log_created_at').on(table.createdAt),
    index('idx_ai_inference_log_provider_model').on(table.provider, table.model),
    index('idx_ai_inference_log_operation').on(table.operation),
    index('idx_ai_inference_log_domain').on(table.domain),
    index('idx_ai_inference_log_context_id').on(table.contextId),
    index('idx_ai_inference_log_status').on(table.status),
  ]
);
