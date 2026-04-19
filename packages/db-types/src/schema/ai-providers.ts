import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  baseUrl: text('base_url'),
  apiKeyRef: text('api_key_ref'),
  status: text('status').notNull().default('active'),
  lastHealthCheck: text('last_health_check'),
  lastLatencyMs: integer('last_latency_ms'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
