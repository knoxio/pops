/**
 * Item connections tRPC router — connect/disconnect inventory items.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../shared/pagination.js';
import { protectedProcedure, router } from '../../trpc.js';
import * as service from './service.js';
import {
  ConnectionQuerySchema,
  ConnectItemsSchema,
  DisconnectItemsSchema,
  GraphQuerySchema,
  ItemConnectionSchema,
  toConnection,
  TraceQuerySchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const connectionsRouter = router({
  /** Connect two inventory items. Enforces A<B ordering automatically. */
  connect: protectedProcedure.input(ConnectItemsSchema).mutation(({ input, ctx }) => {
    try {
      const row = service.connectItems(ctx.inventoryDb, input.itemAId, input.itemBId);
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

  /** Disconnect two items by their item IDs. Normalises A<B ordering automatically. */
  disconnect: protectedProcedure.input(DisconnectItemsSchema).mutation(({ input, ctx }) => {
    try {
      service.disconnectItems(ctx.inventoryDb, input.itemAId, input.itemBId);
      return { message: 'Items disconnected' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** List all connections for an item (appears in either A or B column). */
  listForItem: protectedProcedure
    .input(ConnectionQuerySchema)
    .output(z.object({ data: z.array(ItemConnectionSchema), pagination: PaginationMetaSchema }))
    .query(({ input, ctx }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const { rows, total } = service.listConnectionsForItem(
        ctx.inventoryDb,
        input.itemId,
        limit,
        offset
      );

      return {
        data: rows.map(toConnection),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Trace the connection chain from an item as a tree. */
  trace: protectedProcedure.input(TraceQuerySchema).query(({ input, ctx }) => {
    try {
      const tree = service.traceConnections(ctx.inventoryDb, input.itemId, input.maxDepth);
      return { data: tree };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Get the connection subgraph for an item as nodes + edges. */
  graph: protectedProcedure.input(GraphQuerySchema).query(({ input, ctx }) => {
    try {
      const graph = service.getConnectionGraph(ctx.inventoryDb, input.itemId, input.maxDepth);
      return { data: graph };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),
});
