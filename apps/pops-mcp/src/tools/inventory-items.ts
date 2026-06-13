import { items, itemWriteTools } from './inventory-items-write.js';
import { mapCallResult, optBool, optNum, optStr, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

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
    return mapCallResult(
      await items().list({
        search: optStr(args, 'search'),
        locationId: optStr(args, 'locationId'),
        includeChildren: optBool(args, 'includeChildren'),
        type: optStr(args, 'type'),
        condition: optStr(args, 'condition'),
        limit: optNum(args, 'limit'),
        offset: optNum(args, 'offset'),
      })
    );
  },
};

const itemGet: ToolDef = {
  name: 'inventory.items.get',
  description: 'Get a single inventory item by ID, including all metadata.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Item ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await items().get({ id }));
  },
};

export const itemTools: readonly ToolDef[] = [itemsList, itemGet, ...itemWriteTools];
