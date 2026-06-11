/**
 * Budget tRPC router — CRUD procedures for budgets.
 *
 * Migrated from `apps/pops-api/src/modules/finance/budgets/router.ts`
 * as part of Phase 5 PR 1 (Track M2). The finance DB handle is injected
 * via the tRPC context rather than reached through `getFinanceDrizzle()`
 * so finance-api stands alone of pops-api in the dep graph. Procedure
 * paths stay rooted at `finance.budgets.*` for a transparent dispatcher
 * swap in Phase 5 PR 2.
 *
 * Domain errors from `@pops/finance-db` (`BudgetNotFoundError`,
 * `BudgetConflictError`) are translated to local `HttpError` subclasses
 * inside each handler and then routed through `mapDomainErrors` so the
 * tRPC layer sees a proper `TRPCError` with the right wire-level `code`
 * (`NOT_FOUND` / `CONFLICT`).
 *
 * Note: the legacy router carried `meta({ openapi: ... })` on `list` and
 * `get` so they appeared in the pops-api OpenAPI schema. The dispatcher
 * (PR 2) keeps publishing OpenAPI from pops-api so the meta stays there
 * during the dual-mount window; it is intentionally NOT replicated here.
 */
import { z } from 'zod';

import { BudgetConflictError, BudgetNotFoundError, budgetsService } from '@pops/finance-db';

import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../shared/pagination.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';
import {
  BudgetQuerySchema,
  BudgetSchema,
  CreateBudgetSchema,
  toBudget,
  UpdateBudgetSchema,
} from './types.js';

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function translateBudgetError(err: unknown, id?: string): never {
  if (err instanceof BudgetNotFoundError) {
    throw new NotFoundError('Budget', id ?? err.id);
  }
  if (err instanceof BudgetConflictError) {
    throw new ConflictError(err.message);
  }
  throw err;
}

export const budgetsRouter = router({
  /** List budgets with optional search/period/active filters and pagination. */
  list: protectedProcedure
    .input(BudgetQuerySchema)
    .output(z.object({ data: z.array(BudgetSchema), pagination: PaginationMetaSchema }))
    .query(({ input, ctx }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      let activeFilter: boolean | undefined;
      if (input.active === 'true') activeFilter = true;
      else if (input.active === 'false') activeFilter = false;
      else activeFilter = undefined;

      const { rows, total } = budgetsService.listBudgets(ctx.financeDb, {
        search: input.search,
        period: input.period,
        active: activeFilter,
        limit,
        offset,
      });

      return {
        data: rows.map(toBudget),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Get a single budget by ID. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: BudgetSchema }))
    .query(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          const row = budgetsService.getBudget(ctx.financeDb, input.id);
          return { data: toBudget(budgetsService.withSpend(ctx.financeDb, row)) };
        } catch (err) {
          translateBudgetError(err, input.id);
        }
      })
    ),

  /** Create a new budget. */
  create: protectedProcedure.input(CreateBudgetSchema).mutation(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        const row = budgetsService.createBudget(ctx.financeDb, input);
        return {
          data: toBudget(budgetsService.withSpend(ctx.financeDb, row)),
          message: 'Budget created',
        };
      } catch (err) {
        translateBudgetError(err);
      }
    })
  ),

  /** Update an existing budget. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateBudgetSchema,
      })
    )
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          const row = budgetsService.updateBudget(ctx.financeDb, input.id, input.data);
          return {
            data: toBudget(budgetsService.withSpend(ctx.financeDb, row)),
            message: 'Budget updated',
          };
        } catch (err) {
          translateBudgetError(err, input.id);
        }
      })
    ),

  /** Delete a budget. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        budgetsService.deleteBudget(ctx.financeDb, input.id);
        return { message: 'Budget deleted' };
      } catch (err) {
        translateBudgetError(err, input.id);
      }
    })
  ),
});
