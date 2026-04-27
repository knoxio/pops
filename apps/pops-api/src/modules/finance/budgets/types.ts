import { z } from 'zod';

import type { BudgetRow } from '@pops/db-types';

import type { BudgetWithSpend } from './service.js';

export type { BudgetRow };

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
 * Map a SQLite row (enriched with spend aggregates) to the API response shape.
 * Converts active from INTEGER (0/1) to boolean.
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

/** Zod schema for the budget response shape. */
export const BudgetSchema = z.object({
  id: z.string(),
  category: z.string(),
  period: z.string().nullable(),
  amount: z.number().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  lastEditedTime: z.string(),
  spent: z.number(),
  remaining: z.number().nullable(),
});

/** Zod schema for creating a budget. */
export const CreateBudgetSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  period: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  active: z.boolean().optional().default(false),
  notes: z.string().nullable().optional(),
});
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>;

/** Zod schema for updating a budget (all fields optional). */
export const UpdateBudgetSchema = z.object({
  category: z.string().min(1, 'Category cannot be empty').optional(),
  period: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetSchema>;

/** Zod schema for budget list query params. */
export const BudgetQuerySchema = z.object({
  search: z.string().optional(),
  period: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type BudgetQuery = z.infer<typeof BudgetQuerySchema>;
