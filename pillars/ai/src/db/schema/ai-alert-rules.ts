/**
 * `ai_alert_rules` (see pillars/ai/docs/prds/ai-observability) — configurable
 * rules that the alert evaluator job runs to decide whether to fire an alert.
 *
 * - `type` is one of `budget-threshold`, `error-spike`, `latency-degradation`.
 * - `threshold_value` semantics depend on type:
 *     budget-threshold       → percentage of a budget limit (e.g. 80 = 80%)
 *     error-spike            → percentage error rate (e.g. 10 = 10%)
 *     latency-degradation    → P95 milliseconds (e.g. 10000 = 10s)
 * - `window_minutes` is the rolling window for rate/percentile-based rules.
 *   Budget rules ignore the window — they evaluate against the current month.
 * - `scope_provider` / `scope_model` are optional filters. Null = match all.
 */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aiAlertRules = sqliteTable(
  'ai_alert_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    scopeProvider: text('scope_provider'),
    scopeModel: text('scope_model'),
    thresholdValue: real('threshold_value').notNull(),
    windowMinutes: integer('window_minutes'),
    enabled: integer('enabled').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_ai_alert_rules_type').on(table.type),
    index('idx_ai_alert_rules_enabled').on(table.enabled),
  ]
);
