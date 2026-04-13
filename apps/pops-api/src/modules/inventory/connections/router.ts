/**
 * Item connections tRPC router — connect/disconnect inventory items.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { paginationMeta } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import {
  ConnectionQuerySchema,
  ConnectItemsSchema,
  GraphQuerySchema,
  toConnection,
  TraceQuerySchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const connectionsRouter = router({
  /** Connect two inventory items. Enforces A<B ordering automatically. */
  connect: protectedProcedure.input(ConnectItemsSchema).mutation(({ input }) => {
    try {
      const row = service.connectItems(input.itemAId, input.itemBId);
      return {
        data: toConnection(row),
        message: 'Items connected',
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: 'CONFLICT', message: err.message });
      }
      throw err;
    }
  }),

  /** Disconnect two items by connection ID. */
  disconnect: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.disconnectItems(input.id);
        return { message: 'Items disconnected' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** List all connections for an item (appears in either A or B column). */
  listForItem: protectedProcedure.input(ConnectionQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listConnectionsForItem(input.itemId, limit, offset);

    return {
      data: rows.map(toConnection),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Trace the connection chain from an item as a tree. */
  trace: protectedProcedure.input(TraceQuerySchema).query(({ input }) => {
    try {
      const tree = service.traceConnections(input.itemId, input.maxDepth);
      return { data: tree };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Get the connection subgraph for an item as nodes + edges. */
  graph: protectedProcedure.input(GraphQuerySchema).query(({ input }) => {
    try {
      const graph = service.getConnectionGraph(input.itemId, input.maxDepth);
      return { data: graph };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),
});
