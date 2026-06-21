/**
 * Handlers for the `ai-budgets.*` sub-router.
 *
 * Thin wrappers over the existing `ai-budgets/service.ts` (list, status,
 * upsert — all landing on `core.db`). Wire shapes (`Budget`, `BudgetStatus`)
 * are preserved verbatim.
 */
import { type AiDb } from '../../db/index.js';
import { getBudgetStatus, listBudgets, upsertBudget } from '../modules/ai-budgets/service.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiBudgetsContract } from '../../contract/rest-ai-budgets.js';

type Req = ServerInferRequest<typeof aiBudgetsContract>;

export function makeAiBudgetsHandlers(db: AiDb) {
  return {
    list: () => runHttp(() => ({ status: 200 as const, body: listBudgets(db) })),

    getBudgetStatus: () => runHttp(() => ({ status: 200 as const, body: getBudgetStatus(db) })),

    upsert: ({ body }: Req['upsert']) =>
      runHttp(() => ({ status: 200 as const, body: upsertBudget(db, body) })),
  };
}
