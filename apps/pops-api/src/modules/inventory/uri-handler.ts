/**
 * Inventory URI handler (PRD-101 US-08, ADR-012).
 *
 * Owns `pops:inventory/item/{id}` and `pops:inventory/location/{id}`. Both
 * tables use string UUID primary keys, so the id segment is passed through
 * verbatim to the service layer.
 */
import { NotFoundError } from '../../shared/errors.js';
import { getInventoryItem } from './items/service.js';
import { getLocation } from './locations/service.js';

import type { UriHandlerDescriptor, UriResolution } from '@pops/types';

export const INVENTORY_URI_TYPES = ['item', 'location'] as const;

async function tryGet<TData>(get: () => TData | Promise<TData>): Promise<UriResolution<TData>> {
  try {
    return { kind: 'object', data: await get() };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { kind: 'not-found' };
    }
    throw error;
  }
}

export const inventoryUriHandler: UriHandlerDescriptor = {
  types: INVENTORY_URI_TYPES,
  resolve: async (type, id) => {
    switch (type) {
      case 'item':
        return tryGet(() => getInventoryItem(id));
      case 'location':
        return tryGet(() => getLocation(id));
      default:
        return { kind: 'not-found' };
    }
  },
};
