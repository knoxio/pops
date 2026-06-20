import { z } from 'zod';

import { BUDGET_PERIODS } from '../types/budget.js';

export const BudgetPeriodSchema = z.enum(BUDGET_PERIODS);

export const BudgetSchema = z.object({
  id: z.string(),
  name: z.string(),
  cap: z.number().nonnegative(),
  period: BudgetPeriodSchema,
  categoryId: z.string().nullable(),
  lastEditedTime: z.string().datetime(),
});
