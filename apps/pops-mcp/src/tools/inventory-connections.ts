import { getClient } from '../client.js';
import { ok, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

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
    const result = await getClient().inventory.connections.listForItem.query({
      itemId,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return ok(result);
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
    const result = await getClient().inventory.connections.graph.query({
      itemId,
      maxDepth: typeof args['maxDepth'] === 'number' ? args['maxDepth'] : undefined,
    });
    return ok(result.data);
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
    const itemBId = reqStr(args, 'itemBId');
    if (!itemAId) return toolError('Missing required field: itemAId');
    if (!itemBId) return toolError('Missing required field: itemBId');
    const result = await getClient().inventory.connections.connect.mutate({ itemAId, itemBId });
    return ok(result.data);
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
    const itemBId = reqStr(args, 'itemBId');
    if (!itemAId) return toolError('Missing required field: itemAId');
    if (!itemBId) return toolError('Missing required field: itemBId');
    const result = await getClient().inventory.connections.disconnect.mutate({ itemAId, itemBId });
    return ok(result);
  },
};

export const connectionTools: readonly ToolDef[] = [
  connectionsList,
  connectionsGraph,
  connectionsConnect,
  connectionsDisconnect,
];
