/**
 * Handlers for the `budgets.*` sub-router. `translateBudgetError` maps db
 * domain errors (`BudgetNotFoundError`, `BudgetConflictError`) to shared
 * `HttpError` subclasses so `runHttp` yields 404 / 409.
 */
import {
  BudgetConflictError,
  BudgetNotFoundError,
  budgetsService,
  type FinanceDb,
} from '../../db/index.js';
import { toBudget } from '../modules/budgets-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeBudgetsContract } from '../../contract/rest-budgets.js';

type Req = ServerInferRequest<typeof financeBudgetsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function translateBudgetError(err: unknown, id?: string): never {
  if (err instanceof BudgetNotFoundError) throw new NotFoundError('Budget', id ?? err.id);
  if (err instanceof BudgetConflictError) throw new ConflictError(err.message);
  throw err;
}

export function makeBudgetsHandlers(db: FinanceDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        let activeFilter: boolean | undefined;
        if (query.active === 'true') activeFilter = true;
        else if (query.active === 'false') activeFilter = false;

        const { rows, total } = budgetsService.listBudgets(db, {
          search: query.search,
          period: query.period,
          active: activeFilter,
          limit,
          offset,
        });

        return {
          status: 200 as const,
          body: { data: rows.map(toBudget), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = budgetsService.getBudget(db, params.id);
          return {
            status: 200 as const,
            body: { data: toBudget(budgetsService.withSpend(db, row)) },
          };
        } catch (err) {
          translateBudgetError(err, params.id);
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = budgetsService.createBudget(db, body);
          return {
            status: 201 as const,
            body: { data: toBudget(budgetsService.withSpend(db, row)), message: 'Budget created' },
          };
        } catch (err) {
          translateBudgetError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = budgetsService.updateBudget(db, params.id, body);
          return {
            status: 200 as const,
            body: { data: toBudget(budgetsService.withSpend(db, row)), message: 'Budget updated' },
          };
        } catch (err) {
          translateBudgetError(err, params.id);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          budgetsService.deleteBudget(db, params.id);
          return { status: 200 as const, body: { message: 'Budget deleted' } };
        } catch (err) {
          translateBudgetError(err, params.id);
        }
      }),
  };
}
