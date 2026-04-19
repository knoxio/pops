import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aiBudgets = sqliteTable('ai_budgets', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type').notNull(),
  scopeValue: text('scope_value'),
  monthlyTokenLimit: integer('monthly_token_limit'),
  monthlyCostLimit: real('monthly_cost_limit'),
  action: text('action').notNull().default('warn'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
