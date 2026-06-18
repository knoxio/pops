import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

/**
 * Daily aggregation table for AI inference logs (PRD-092 US-08).
 *
 * Once raw `ai_inference_log` rows pass the retention horizon (default 90 days),
 * a scheduled job rolls them up into one row per
 * `(date, provider, model, operation, domain)` tuple and deletes the originals.
 *
 * The table is append-mostly — written exclusively by the retention job,
 * read by the dashboard's history endpoint to provide a continuous timeline
 * across the retention boundary.
 */
export const aiInferenceDaily = sqliteTable(
  'ai_inference_daily',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** ISO date `YYYY-MM-DD` — UTC day of the aggregated rows. */
    date: text('date').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    /** Nullable for cross-domain calls. SQLite treats NULLs as distinct in
     *  unique indexes, so the upsert path coerces NULL → empty string when
     *  computing the aggregation key — see the retention service. */
    domain: text('domain'),
    totalCalls: integer('total_calls').notNull().default(0),
    totalInputTokens: integer('total_input_tokens').notNull().default(0),
    totalOutputTokens: integer('total_output_tokens').notNull().default(0),
    totalCostUsd: real('total_cost_usd').notNull().default(0),
    /** Mean of `latency_ms` across the aggregated rows (success + non-cached only). */
    avgLatencyMs: integer('avg_latency_ms').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    timeoutCount: integer('timeout_count').notNull().default(0),
    cacheHitCount: integer('cache_hit_count').notNull().default(0),
    budgetBlockedCount: integer('budget_blocked_count').notNull().default(0),
  },
  (table) => [
    // Unique on the natural aggregation key so upserts can target it. SQLite
    // treats NULLs as distinct, so we always store a sentinel empty string
    // when domain is null (handled in the service layer).
    uniqueIndex('idx_ai_inference_daily_key').on(
      table.date,
      table.provider,
      table.model,
      table.operation,
      table.domain
    ),
    index('idx_ai_inference_daily_date').on(table.date),
    index('idx_ai_inference_daily_provider_model').on(table.provider, table.model),
  ]
);

export type AiInferenceDailyRow = InferSelectModel<typeof aiInferenceDaily>;
export type AiInferenceDailyInsert = InferInsertModel<typeof aiInferenceDaily>;
