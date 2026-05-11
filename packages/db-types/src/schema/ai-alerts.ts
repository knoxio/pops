/**
 * `ai_alerts` (PRD-092 US-07) — fired alerts produced by the evaluator job.
 *
 * `scope_detail` is a human-readable scope identifier used both for display
 * and for deduplication; the evaluator suppresses inserts when an alert with
 * the same `(type, scope_detail)` was created within the last hour.
 */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { aiAlertRules } from './ai-alert-rules.js';

export const aiAlerts = sqliteTable(
  'ai_alerts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ruleId: integer('rule_id').references(() => aiAlertRules.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    message: text('message').notNull(),
    severity: text('severity').notNull(),
    scopeDetail: text('scope_detail'),
    metricValue: real('metric_value').notNull(),
    thresholdValue: real('threshold_value').notNull(),
    acknowledged: integer('acknowledged').notNull().default(0),
    acknowledgedAt: text('acknowledged_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_ai_alerts_created_at').on(table.createdAt),
    index('idx_ai_alerts_type').on(table.type),
    index('idx_ai_alerts_severity').on(table.severity),
    index('idx_ai_alerts_acknowledged').on(table.acknowledged),
    index('idx_ai_alerts_dedupe').on(table.type, table.scopeDetail, table.createdAt),
  ]
);
