import { getClient } from '../client.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from './index.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const locationTree: ToolDef = {
  name: 'inventory.locations.tree',
  description:
    'Get the full location hierarchy as a nested tree. Returns all locations with their children.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    const result = await getClient().inventory.locations.tree.query();
    return ok(result.data);
  },
};

const locationsList: ToolDef = {
  name: 'inventory.locations.list',
  description: 'List all locations as a flat array.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    const result = await getClient().inventory.locations.list.query();
    return ok(result);
  },
};

const itemsList: ToolDef = {
  name: 'inventory.items.list',
  description:
    'List inventory items. Supports filtering by search query, location, type, or condition.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Full-text search across item name and description' },
      locationId: { type: 'string', description: 'Filter items by location ID' },
      includeChildren: {
        type: 'boolean',
        description: 'Include items in child locations (default false)',
      },
      type: { type: 'string', description: 'Filter by item type (e.g. "electronics")' },
      condition: { type: 'string', description: 'Filter by condition (e.g. "good", "fair")' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await getClient().inventory.items.list.query({
      search: typeof args['search'] === 'string' ? args['search'] : undefined,
      locationId: typeof args['locationId'] === 'string' ? args['locationId'] : undefined,
      includeChildren:
        typeof args['includeChildren'] === 'boolean' ? args['includeChildren'] : undefined,
      type: typeof args['type'] === 'string' ? args['type'] : undefined,
      condition: typeof args['condition'] === 'string' ? args['condition'] : undefined,
      limit: typeof args['limit'] === 'number' ? args['limit'] : undefined,
      offset: typeof args['offset'] === 'number' ? args['offset'] : undefined,
    });
    return ok(result);
  },
};

const itemGet: ToolDef = {
  name: 'inventory.items.get',
  description: 'Get a single inventory item by ID, including all metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Item ID' },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const result = await getClient().inventory.items.get.query({
      id: String(args['id']),
    });
    return ok(result.data);
  },
};

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
    const result = await getClient().inventory.connections.listForItem.query({
      itemId: String(args['itemId']),
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
    const result = await getClient().inventory.connections.graph.query({
      itemId: String(args['itemId']),
      maxDepth: typeof args['maxDepth'] === 'number' ? args['maxDepth'] : undefined,
    });
    return ok(result.data);
  },
};

export const inventoryTools: readonly ToolDef[] = [
  locationTree,
  locationsList,
  itemsList,
  itemGet,
  connectionsList,
  connectionsGraph,
];
