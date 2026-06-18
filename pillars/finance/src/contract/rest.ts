/**
 * REST contract for the finance pillar — ts-rest single source of truth.
 *
 * Composes the migrated domain sub-routers (wishlist, budgets,
 * transactions, tagRules, corrections, imports) into the public wire surface.
 * `generateOpenApi(financeContract, …)` projects this to
 * `openapi/finance.openapi.json`; `openapi-typescript` then projects the
 * JSON to `src/contract/api-types.generated.ts`.
 *
 * Lego principle: this is the ONLY description of the finance wire format.
 * Don't hand-author OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { financeBudgetsContract } from './rest-budgets.js';
import { financeCorrectionsContract } from './rest-corrections.js';
import { financeImportsContract } from './rest-imports.js';
import { financeSearchContract } from './rest-search.js';
import { financeTagRulesContract } from './rest-tag-rules.js';
import { financeTransactionsContract } from './rest-transactions.js';
import { financeWishlistContract } from './rest-wishlist.js';

const c = initContract();

export const financeContract = c.router(
  {
    wishlist: financeWishlistContract,
    budgets: financeBudgetsContract,
    transactions: financeTransactionsContract,
    tagRules: financeTagRulesContract,
    corrections: financeCorrectionsContract,
    imports: financeImportsContract,
    search: financeSearchContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type FinanceRestContract = typeof financeContract;
