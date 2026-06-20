/**
 * `budgets.*` sub-router — budget CRUD.
 *
 * Response/body schemas mirror the legacy `finance.budgets.*` tRPC wire
 * shapes (`toBudget` enriched with spend aggregates + the create/update
 * zod inputs) so the REST cutover is transparent to the FE.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, LimitQuery, MessageSchema, OffsetQuery } from './rest-schemas.js';

const c = initContract();

const BudgetPeriodBody = z.enum(['Monthly', 'Yearly']).nullable().optional();

/** Wire shape served by the budget handlers (enriched with spend aggregates). */
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

const CreateBudgetBody = z.object({
  category: z.string().min(1, 'Category is required'),
  period: BudgetPeriodBody,
  amount: z.number().nullable().optional(),
  active: z.boolean().optional().default(false),
  notes: z.string().nullable().optional(),
});

const UpdateBudgetBody = z.object({
  category: z.string().min(1, 'Category cannot be empty').optional(),
  period: BudgetPeriodBody,
  amount: z.number().nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const BudgetQuery = z.object({
  search: z.string().optional(),
  period: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

const BudgetMutation = z.object({ data: BudgetSchema, message: z.string() });

export const financeBudgetsContract = c.router({
  list: {
    method: 'GET',
    path: '/budgets',
    query: BudgetQuery,
    responses: {
      200: z.object({
        data: z.array(BudgetSchema),
        pagination: z.object({
          total: z.number(),
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    },
    summary: 'List budgets with optional search / period / active filters and pagination',
  },
  get: {
    method: 'GET',
    path: '/budgets/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: BudgetSchema }), ...ERR_RESPONSES },
    summary: 'Get a single budget (with spend aggregates)',
  },
  create: {
    method: 'POST',
    path: '/budgets',
    body: CreateBudgetBody,
    responses: { 201: BudgetMutation, ...ERR_RESPONSES },
    summary: 'Create a budget',
  },
  update: {
    method: 'PATCH',
    path: '/budgets/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateBudgetBody,
    responses: { 200: BudgetMutation, ...ERR_RESPONSES },
    summary: 'Update a budget',
  },
  delete: {
    method: 'DELETE',
    path: '/budgets/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a budget',
  },
});
