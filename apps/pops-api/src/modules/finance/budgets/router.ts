/**
 * Budget tRPC router — CRUD procedures for budgets.
 *
 * Calls into `@pops/finance-db`'s `budgetsService` directly (the in-tree
 * shim stays in place until PR 4 of the Track N1 phase 1 sequence deletes
 * it).
 *
 * Domain errors from the package (`BudgetNotFoundError`,
 * `BudgetConflictError`) are translated to `HttpError` subclasses inside
 * each handler and then routed through `mapDomainErrors` so the tRPC
 * layer sees a proper `TRPCError` with the right wire-level `code`
 * (`NOT_FOUND` / `CONFLICT`). Throwing `HttpError` directly out of a
 * tRPC handler surfaces as `INTERNAL_SERVER_ERROR` at the OpenAPI
 * boundary, which we don't want.
 */
import { z } from 'zod';

import { BudgetConflictError, BudgetNotFoundError, budgetsService } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../db/finance-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../../shared/pagination.js';
import { mapDomainErrors } from '../../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../../trpc.js';
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
    .meta({
      openapi: {
        method: 'GET',
        path: '/finance/budgets',
        summary: 'List budgets',
        tags: ['budgets'],
      },
    })
    .input(BudgetQuerySchema)
    .output(z.object({ data: z.array(BudgetSchema), pagination: PaginationMetaSchema }))
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      let activeFilter: boolean | undefined;
      if (input.active === 'true') activeFilter = true;
      else if (input.active === 'false') activeFilter = false;
      else activeFilter = undefined;

      const { rows, total } = budgetsService.listBudgets(getFinanceDrizzle(), {
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
    .meta({
      openapi: {
        method: 'GET',
        path: '/finance/budgets/{id}',
        summary: 'Get budget by ID',
        tags: ['budgets'],
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: BudgetSchema }))
    .query(({ input }) =>
      mapDomainErrors(() => {
        try {
          const db = getFinanceDrizzle();
          const row = budgetsService.getBudget(db, input.id);
          return { data: toBudget(budgetsService.withSpend(db, row)) };
        } catch (err) {
          translateBudgetError(err, input.id);
        }
      })
    ),

  /** Create a new budget. */
  create: protectedProcedure.input(CreateBudgetSchema).mutation(({ input }) =>
    mapDomainErrors(() => {
      try {
        const db = getFinanceDrizzle();
        const row = budgetsService.createBudget(db, input);
        return {
          data: toBudget(budgetsService.withSpend(db, row)),
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
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        try {
          const db = getFinanceDrizzle();
          const row = budgetsService.updateBudget(db, input.id, input.data);
          return {
            data: toBudget(budgetsService.withSpend(db, row)),
            message: 'Budget updated',
          };
        } catch (err) {
          translateBudgetError(err, input.id);
        }
      })
    ),

  /** Delete a budget. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
    mapDomainErrors(() => {
      try {
        budgetsService.deleteBudget(getFinanceDrizzle(), input.id);
        return { message: 'Budget deleted' };
      } catch (err) {
        translateBudgetError(err, input.id);
      }
    })
  ),
});
