/**
 * Wire mapper for the budgets domain. The zod schemas now live in the
 * REST contract (`src/contract/rest-budgets.ts`); this file keeps only
 * the row → response projection and its TS shape.
 */
import type { BudgetWithSpend } from '../../db/index.js';

/** API response shape (camelCase). */
export interface Budget {
  id: string;
  category: string;
  period: string | null;
  amount: number | null;
  active: boolean;
  notes: string | null;
  lastEditedTime: string;
  /** Aggregated outflow over the budget's period (always >= 0). */
  spent: number;
  /** `amount - spent`, or `null` when the budget has no target amount. */
  remaining: number | null;
}

/**
 * Map a SQLite row (enriched with spend aggregates) to the API response
 * shape. Converts `active` from INTEGER (0/1) to boolean.
 */
export function toBudget(row: BudgetWithSpend): Budget {
  return {
    id: row.id,
    category: row.category,
    period: row.period,
    amount: row.amount,
    active: row.active === 1,
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
    spent: row.spent,
    remaining: row.remaining,
  };
}
