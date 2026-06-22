/**
 * ts-rest handler composer for the finance pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<FinanceRestContract>` that
 * `createExpressEndpoints` consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { financeContract } from '../../contract/rest.js';
import { type OpenedFinanceDb } from '../../db/index.js';
import { makeBudgetsHandlers } from './budgets-handlers.js';
import { makeCorrectionsHandlers } from './corrections-handlers.js';
import { makeEntityUsageHandlers } from './entity-usage-handlers.js';
import { makeImportsHandlers } from './imports-handlers.js';
import { makeSearchHandlers } from './search-handlers.js';
import { makeSettingsHandlers } from './settings-handlers.js';
import { makeTagRulesHandlers } from './tag-rules-handlers.js';
import { makeTransactionsHandlers } from './transactions-handlers.js';
import { makeWishlistHandlers } from './wishlist-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeFinanceRestHandlers(deps: {
  financeDb: OpenedFinanceDb;
}): ReturnType<typeof server.router<typeof financeContract>> {
  const db = deps.financeDb.db;
  return server.router(financeContract, {
    wishlist: makeWishlistHandlers(db),
    budgets: makeBudgetsHandlers(db),
    transactions: makeTransactionsHandlers(db),
    tagRules: makeTagRulesHandlers(db),
    corrections: makeCorrectionsHandlers(db),
    entityUsage: makeEntityUsageHandlers(db),
    imports: makeImportsHandlers(db),
    search: makeSearchHandlers(db),
    settings: makeSettingsHandlers(db),
  });
}
