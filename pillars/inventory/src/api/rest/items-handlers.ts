import { type InventoryDb } from '../../db/index.js';
import * as service from '../modules/items/service.js';
import { toInventoryItem } from '../modules/items/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryItemsContract } from '../../contract/rest-items.js';

type Req = ServerInferRequest<typeof inventoryItemsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function parseTriBool(value: 'true' | 'false' | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Handlers for the `items.*` ts-rest sub-router. Thin pass-throughs to
 * the items service; ts-rest validates input, `runHttp` maps service
 * `HttpError`s (NotFound → 404) to response envelopes.
 */
export function makeItemsHandlers(db: InventoryDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total, totalReplacementValue, totalResaleValue } = service.listInventoryItems(
          db,
          {
            search: query.search,
            room: query.room,
            type: query.type,
            condition: query.condition,
            inUse: parseTriBool(query.inUse),
            deductible: parseTriBool(query.deductible),
            limit,
            offset,
            locationId: query.locationId,
            assetId: query.assetId,
            includeChildren: query.includeChildren,
          }
        );
        return {
          status: 200 as const,
          body: {
            data: rows.map(toInventoryItem),
            pagination: paginationMeta(total, limit, offset),
            totals: { totalReplacementValue, totalResaleValue },
          },
        };
      }),

    searchByAssetId: ({ query }: Req['searchByAssetId']) =>
      runHttp(() => {
        const row = service.searchByAssetId(db, query.assetId);
        return { status: 200 as const, body: { data: row ? toInventoryItem(row) : null } };
      }),

    countByAssetPrefix: ({ query }: Req['countByAssetPrefix']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: service.countByAssetPrefix(db, query.prefix) },
      })),

    distinctTypes: () =>
      runHttp(() => ({ status: 200 as const, body: { data: service.getDistinctTypes(db) } })),

    get: ({ params }: Req['get']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: toInventoryItem(service.getInventoryItem(db, params.id)) },
      })),

    create: ({ body }: Req['create']) =>
      runHttp(() => ({
        status: 201 as const,
        body: {
          data: toInventoryItem(service.createInventoryItem(db, body)),
          message: 'Inventory item created',
        },
      })),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: toInventoryItem(service.updateInventoryItem(db, params.id, body)),
          message: 'Inventory item updated',
        },
      })),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        service.deleteInventoryItem(db, params.id);
        return { status: 200 as const, body: { message: 'Inventory item deleted' } };
      }),
  };
}
