import { type InventoryDb } from '../../db/index.js';
import * as service from '../modules/connections/service.js';
import { toConnection } from '../modules/connections/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryConnectionsContract } from '../../contract/rest-connections.js';

type Req = ServerInferRequest<typeof inventoryConnectionsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/** Handlers for the `connections.*` sub-router — edges + trace/graph traversals. */
export function makeConnectionsHandlers(db: InventoryDb) {
  return {
    connect: ({ body }: Req['connect']) =>
      runHttp(() => {
        const row = service.connectItems(db, body.itemAId, body.itemBId);
        return {
          status: 201 as const,
          body: { data: toConnection(row), message: 'Items connected' },
        };
      }),

    disconnect: ({ query }: Req['disconnect']) =>
      runHttp(() => {
        service.disconnectItems(db, query.itemAId, query.itemBId);
        return { status: 200 as const, body: { message: 'Items disconnected' } };
      }),

    listForItem: ({ params, query }: Req['listForItem']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = service.listConnectionsForItem(db, params.itemId, limit, offset);
        return {
          status: 200 as const,
          body: { data: rows.map(toConnection), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    trace: ({ params, query }: Req['trace']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: service.traceConnections(db, params.itemId, query.maxDepth) },
      })),

    graph: ({ params, query }: Req['graph']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: service.getConnectionGraph(db, params.itemId, query.maxDepth) },
      })),
  };
}
