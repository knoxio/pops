import { getClient } from '../client.js';
import { fixtureWriteTools } from './inventory-fixtures-write.js';
import { ok, optNum, optStr, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

const fixturesList: ToolDef = {
  name: 'inventory.fixtures.list',
  description: 'List fixtures. Supports filtering by location ID or type, with pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      locationId: { type: 'string', description: 'Filter by location ID' },
      type: {
        type: 'string',
        description: 'Filter by fixture type (e.g. "outlet", "patch_panel")',
      },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const result = await getClient().inventory.fixtures.list.query({
      locationId: optStr(args, 'locationId'),
      type: optStr(args, 'type'),
      limit: optNum(args, 'limit'),
      offset: optNum(args, 'offset'),
    });
    return ok(result);
  },
};

const fixturesGet: ToolDef = {
  name: 'inventory.fixtures.get',
  description: 'Get a single fixture by ID.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Fixture ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Invalid "id"');
    const result = await getClient().inventory.fixtures.get.query({ id });
    return ok(result.data);
  },
};

const fixturesListForItem: ToolDef = {
  name: 'inventory.fixtures.listForItem',
  description: 'List all fixtures that an inventory item is connected to.',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: 'Inventory item ID' },
      limit: { type: 'number', description: 'Max results (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
    required: ['itemId'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    if (!itemId) return toolError('Invalid "itemId"');
    const result = await getClient().inventory.fixtures.listForItem.query({
      itemId,
      limit: optNum(args, 'limit'),
      offset: optNum(args, 'offset'),
    });
    return ok(result);
  },
};

export const fixtureTools: readonly ToolDef[] = [
  fixturesList,
  fixturesGet,
  ...fixtureWriteTools,
  fixturesListForItem,
];
