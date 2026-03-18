/**
 * SQLite schema for budgets table (snake_case columns).
 * Used by both notion-sync (writes) and finance-api (reads).
 */
import { z } from "zod/v4";

export const BudgetRowSchema = z.object({
  id: z.string(),
  notion_id: z.string().nullable(),
  category: z.string(),
  period: z.string().nullable(),
  amount: z.number().nullable(),
  active: z.number(),
  notes: z.string().nullable(),
  last_edited_time: z.string(),
});

export type BudgetRow = z.infer<typeof BudgetRowSchema>;
