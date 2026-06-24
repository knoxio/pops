/**
 * `aiBudgets` sub-router — AI budget config + live status.
 *
 * `upsert` carries its `id` in the body, so it stays a `POST` with that body
 * rather than a path-id `PUT`. Output shapes mirror `Budget` / `BudgetStatus`
 * from `api/modules/ai-budgets/service.ts` exactly.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, NonEmptyString } from './rest-schemas.js';

const c = initContract();

/** Mirrors `Budget` in `api/modules/ai-budgets/service.ts`. */
const BudgetSchema = z.object({
  id: z.string(),
  scopeType: z.string(),
  scopeValue: z.string().nullable(),
  monthlyTokenLimit: z.number().nullable(),
  monthlyCostLimit: z.number().nullable(),
  action: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Mirrors `BudgetStatus` in `api/modules/ai-budgets/service.ts`. */
const BudgetStatusSchema = BudgetSchema.extend({
  currentTokenUsage: z.number(),
  currentCostUsage: z.number(),
  percentageUsed: z.number().nullable(),
  projectedExhaustionDate: z.string().nullable(),
});

const UpsertBudgetBody = z.object({
  id: NonEmptyString,
  scopeType: z.enum(['global', 'provider', 'operation']),
  scopeValue: z.string().optional(),
  monthlyTokenLimit: z.number().int().positive().optional(),
  monthlyCostLimit: z.number().positive().optional(),
  action: z.enum(['block', 'warn', 'fallback']).optional(),
});

export const aiBudgetsContract = c.router({
  list: {
    method: 'GET',
    path: '/ai-budgets',
    responses: { 200: z.array(BudgetSchema) },
    summary: 'List configured AI budgets',
  },
  getBudgetStatus: {
    method: 'GET',
    path: '/ai-budgets/status',
    responses: { 200: z.array(BudgetStatusSchema) },
    summary: 'List AI budgets with live month-to-date usage and projected exhaustion',
  },
  upsert: {
    method: 'POST',
    path: '/ai-budgets',
    body: UpsertBudgetBody,
    responses: { 200: BudgetSchema, ...ERR_RESPONSES },
    summary: 'Create or update an AI budget (keyed by id)',
  },
});
