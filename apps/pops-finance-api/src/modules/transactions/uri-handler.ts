/**
 * Transaction URI handler for the finance pillar container (Track O3, #2845).
 *
 * Resolves `pops:finance/transaction/<id>` to a `UriResolution` by calling
 * into `transactionsService.getTransaction` on the injected `FinanceDb`.
 * Mirrors the legacy `apps/pops-api/src/modules/finance/uri-handler.ts`
 * shape but takes the DB handle as a constructor argument rather than
 * reaching through the pops-api `getFinanceDrizzle()` global — finance-api
 * stands alone of pops-api in the dep graph (same convention as the
 * migrated routers from M2 PR 1 and the budget URI handler from O2).
 *
 * The descriptor follows the platform-wide `UriHandlerDescriptor` contract
 * (PRD-101 US-08, ADR-012): resolution that fails because the row is missing
 * returns `{ kind: 'not-found' }`; only hard failures bubble up.
 */
import { TransactionNotFoundError, transactionsService, type FinanceDb } from '@pops/finance-db';

import type { UriHandlerDescriptor, UriResolution } from '@pops/types';

export const TRANSACTION_URI_TYPES = ['transaction'] as const;

async function tryGet<TData>(get: () => TData | Promise<TData>): Promise<UriResolution<TData>> {
  try {
    return { kind: 'object', data: await get() };
  } catch (error) {
    if (error instanceof TransactionNotFoundError) {
      return { kind: 'not-found' };
    }
    throw error;
  }
}

/**
 * Factory for the transaction URI handler. The DB handle is injected so
 * the container can wire it from the same `FinanceDb` it uses for the tRPC
 * routers, and tests can supply an in-memory handle.
 */
export function createTransactionUriHandler(financeDb: FinanceDb): UriHandlerDescriptor {
  return {
    types: TRANSACTION_URI_TYPES,
    resolve: async (type, id) => {
      switch (type) {
        case 'transaction':
          return tryGet(() => transactionsService.getTransaction(financeDb, id));
        default:
          return { kind: 'not-found' };
      }
    },
  };
}
