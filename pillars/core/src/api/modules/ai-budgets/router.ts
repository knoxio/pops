/**
 * tRPC router for AI budget configuration + status (`core.aiBudgets.*`).
 */
import { z } from 'zod';

import { protectedProcedure, router } from '../../trpc.js';
import { getBudgetStatus, listBudgets, upsertBudget } from './service.js';

export const aiBudgetsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listBudgets(ctx.coreDb)),

  getBudgetStatus: protectedProcedure.query(({ ctx }) => getBudgetStatus(ctx.coreDb)),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        scopeType: z.enum(['global', 'provider', 'operation']),
        scopeValue: z.string().optional(),
        monthlyTokenLimit: z.number().int().positive().optional(),
        monthlyCostLimit: z.number().positive().optional(),
        action: z.enum(['block', 'warn', 'fallback']).optional(),
      })
    )
    .mutation(({ input, ctx }) => upsertBudget(ctx.coreDb, input)),
});
