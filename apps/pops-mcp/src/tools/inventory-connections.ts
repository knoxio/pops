import { getPillar } from '../pillar-client.js';
import { mapCallResult, optNum, reqStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './index.js';

type ListForItemInput = { itemId: string; limit?: number; offset?: number };
type GraphInput = { itemId: string; maxDepth?: number };
type PairInput = { itemAId: string; itemBId: string };

type ConnectionsShape = {
  inventory: {
    connections: {
      listForItem: (input: ListForItemInput) => unknown;
      graph: (input: GraphInput) => unknown;
      connect: (input: PairInput) => unknown;
      disconnect: (input: PairInput) => unknown;
    };
  };
};

function connections(): PillarHandle<ConnectionsShape>['inventory']['connections'] {
  return getPillar<ConnectionsShape>('inventory').inventory.connections;
}

const connectionsList: ToolDef = {
  name: 'inventory.connections.list',
  description:
    'List all connections for an inventory item (items linked to it in either direction).',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: 'Item ID to list connections for' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
    required: ['itemId'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    if (!itemId) return toolError('Missing required field: itemId');
    const input: ListForItemInput = { itemId };
    const limit = optNum(args, 'limit');
    if (limit !== undefined) input.limit = limit;
    const offset = optNum(args, 'offset');
    if (offset !== undefined) input.offset = offset;
    return mapCallResult(await connections().listForItem(input));
  },
};

const connectionsGraph: ToolDef = {
  name: 'inventory.connections.graph',
  description:
    'Get the connection graph for an item as nodes + edges. Useful for understanding what an item is connected to and how.',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: 'Item ID to build graph from' },
      maxDepth: { type: 'number', description: 'How many hops to traverse (default 3)' },
    },
    required: ['itemId'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    if (!itemId) return toolError('Missing required field: itemId');
    const input: GraphInput = { itemId };
    const maxDepth = optNum(args, 'maxDepth');
    if (maxDepth !== undefined) input.maxDepth = maxDepth;
    return mapCallResult(await connections().graph(input));
  },
};

const connectionsConnect: ToolDef = {
  name: 'inventory.connections.connect',
  description:
    'Record a physical connection between two inventory items (e.g. a cable between devices). IDs may be passed in any order.',
  inputSchema: {
    type: 'object',
    properties: {
      itemAId: { type: 'string', description: 'First item ID' },
      itemBId: { type: 'string', description: 'Second item ID' },
    },
    required: ['itemAId', 'itemBId'],
  },
  handler: async (args) => {
    const itemAId = reqStr(args, 'itemAId');
    if (!itemAId) return toolError('Missing required field: itemAId');
    const itemBId = reqStr(args, 'itemBId');
    if (!itemBId) return toolError('Missing required field: itemBId');
    return mapCallResult(await connections().connect({ itemAId, itemBId }));
  },
};

const connectionsDisconnect: ToolDef = {
  name: 'inventory.connections.disconnect',
  description:
    'Remove a physical connection between two inventory items. IDs may be passed in any order.',
  inputSchema: {
    type: 'object',
    properties: {
      itemAId: { type: 'string', description: 'First item ID' },
      itemBId: { type: 'string', description: 'Second item ID' },
    },
    required: ['itemAId', 'itemBId'],
  },
  handler: async (args) => {
    const itemAId = reqStr(args, 'itemAId');
    if (!itemAId) return toolError('Missing required field: itemAId');
    const itemBId = reqStr(args, 'itemBId');
    if (!itemBId) return toolError('Missing required field: itemBId');
    return mapCallResult(await connections().disconnect({ itemAId, itemBId }));
  },
};

export const connectionTools: readonly ToolDef[] = [
  connectionsList,
  connectionsGraph,
  connectionsConnect,
  connectionsDisconnect,
];
