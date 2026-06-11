import { BudgetNotFoundError, budgetsService } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../db/finance-handle.js';
import { NotFoundError } from '../../shared/errors.js';
/**
 * Finance URI handler (PRD-101 US-08, ADR-012).
 *
 * Owns the `pops:finance/{type}/{id}` namespace for the three object types
 * that are referenced cross-module: transactions, budgets, and entities
 * (entities live under finance because every existing reference site —
 * search adapter, tag-rule changeset, AI tool — already addresses them via
 * `pops:finance/entity/...`).
 *
 * The handler returns `not-found` on missing rows rather than throwing the
 * service-layer `NotFoundError` — the central dispatcher (US-08) translates
 * its result into a `UriResolverResult` for the caller.
 */
import { getEntity } from '../core/entities/service.js';
import { getTransaction } from './transactions/service.js';

import type { UriHandlerDescriptor, UriResolution } from '@pops/types';

export const FINANCE_URI_TYPES = ['transaction', 'entity', 'budget'] as const;

/** Run a service-layer get and translate `NotFoundError` to `not-found`. */
async function tryGet<TData>(get: () => TData | Promise<TData>): Promise<UriResolution<TData>> {
  try {
    return { kind: 'object', data: await get() };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BudgetNotFoundError) {
      return { kind: 'not-found' };
    }
    throw error;
  }
}

export const financeUriHandler: UriHandlerDescriptor = {
  types: FINANCE_URI_TYPES,
  resolve: async (type, id) => {
    switch (type) {
      case 'transaction':
        return tryGet(() => getTransaction(id));
      case 'entity':
        return tryGet(() => getEntity(id));
      case 'budget':
        return tryGet(() => budgetsService.getBudget(getFinanceDrizzle(), id));
      default:
        return { kind: 'not-found' };
    }
  },
};
