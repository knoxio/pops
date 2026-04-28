/**
 * Reflex execution log schema (PRD-089).
 *
 * Each row represents one reflex trigger firing — what triggered it, what
 * action ran, and the outcome. Used for debugging, history browsing, and
 * preventing duplicate threshold firings.
 */
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const reflexExecutions = sqliteTable(
  'reflex_executions',
  {
    id: text('id').primaryKey(),
    reflexName: text('reflex_name').notNull(),
    triggerType: text('trigger_type').notNull(),
    triggerData: text('trigger_data'),
    actionType: text('action_type').notNull(),
    actionVerb: text('action_verb').notNull(),
    status: text('status').notNull(),
    result: text('result'),
    triggeredAt: text('triggered_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [
    index('idx_reflex_exec_name').on(table.reflexName),
    index('idx_reflex_exec_trigger_type').on(table.triggerType),
    index('idx_reflex_exec_status').on(table.status),
    index('idx_reflex_exec_triggered_at').on(table.triggeredAt),
  ]
);
