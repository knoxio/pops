import { type InventoryDb } from '../../db/index.js';
import { toInventoryItem } from '../modules/items/types.js';
import * as service from '../modules/reports/service.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryReportsContract } from '../../contract/rest-reports.js';

type Req = ServerInferRequest<typeof inventoryReportsContract>;

/** Handlers for the `reports.*` sub-router — read-only; service throws bubble to Express as 500s. */
export function makeReportsHandlers(db: InventoryDb) {
  return {
    dashboard: async () => ({ status: 200 as const, body: { data: service.getDashboard(db) } }),

    warranties: async () => ({
      status: 200 as const,
      body: {
        data: service.listWarrantyItems(db).map((row) => ({
          ...toInventoryItem(row),
          warrantyDocumentId: row.warrantyDocumentId,
        })),
      },
    }),

    insuranceReport: async ({ query }: Req['insuranceReport']) => ({
      status: 200 as const,
      body: {
        data: service.getInsuranceReport(db, {
          locationId: query.locationId,
          includeChildren: query.includeChildren ?? true,
          sortBy: query.sortBy ?? 'value',
        }),
      },
    }),

    valueByLocation: async () => ({
      status: 200 as const,
      body: { data: service.getValueByLocation(db) },
    }),

    valueByType: async () => ({ status: 200 as const, body: { data: service.getValueByType(db) } }),
  };
}
