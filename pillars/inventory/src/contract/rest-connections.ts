/**
 * `connections.*` sub-router — item-to-item connection edges plus the
 * trace (tree) and graph (nodes + edges) traversals.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ERR_RESPONSES,
  MessageSchema,
  NonEmptyString,
  PaginationMetaSchema,
} from './rest-schemas.js';

const c = initContract();

export const ItemConnectionSchema = z.object({
  id: z.number(),
  itemAId: z.string(),
  itemBId: z.string(),
  createdAt: z.string(),
});

export interface TraceNodeShape {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
  children: TraceNodeShape[];
}

const TraceNodeSchema: z.ZodType<TraceNodeShape> = z
  .lazy(() =>
    z.object({
      id: z.string(),
      itemName: z.string(),
      assetId: z.string().nullable(),
      type: z.string().nullable(),
      children: z.array(TraceNodeSchema),
    })
  )
  .meta({ id: 'TraceNode' });

const GraphDataSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      itemName: z.string(),
      assetId: z.string().nullable(),
      type: z.string().nullable(),
    })
  ),
  edges: z.array(z.object({ source: z.string(), target: z.string() })),
});

const MaxDepth = z.coerce.number().int().positive().max(10).optional().default(10);

export const inventoryConnectionsContract = c.router({
  connect: {
    method: 'POST',
    path: '/connections',
    body: z.object({ itemAId: NonEmptyString, itemBId: NonEmptyString }),
    responses: {
      201: z.object({ data: ItemConnectionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Connect two items (A<B ordering enforced server-side)',
  },
  disconnect: {
    method: 'DELETE',
    path: '/connections',
    query: z.object({ itemAId: NonEmptyString, itemBId: NonEmptyString }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Disconnect two items by their item ids',
  },
  listForItem: {
    method: 'GET',
    path: '/items/:itemId/connections',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({
      limit: z.coerce.number().positive().max(500).optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: {
      200: z.object({ data: z.array(ItemConnectionSchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List connections for an item',
  },
  trace: {
    method: 'GET',
    path: '/items/:itemId/connections/trace',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({ maxDepth: MaxDepth }),
    responses: { 200: z.object({ data: TraceNodeSchema }), ...ERR_RESPONSES },
    summary: 'Trace the connection chain from an item as a tree',
  },
  graph: {
    method: 'GET',
    path: '/items/:itemId/connections/graph',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({ maxDepth: MaxDepth }),
    responses: { 200: z.object({ data: GraphDataSchema }), ...ERR_RESPONSES },
    summary: 'Connection subgraph (nodes + edges) for an item',
  },
});
