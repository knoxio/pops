import { fixtureWriteTools, fixtures } from './inventory-fixtures-write.js';
import { mapCallResult, optNum, optStr, reqStr, toolError } from './utils.js';

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
    return mapCallResult(
      await fixtures().list({
        locationId: optStr(args, 'locationId'),
        type: optStr(args, 'type'),
        limit: optNum(args, 'limit'),
        offset: optNum(args, 'offset'),
      })
    );
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
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await fixtures().get({ id }));
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
    if (!itemId) return toolError('Missing required field: itemId');
    return mapCallResult(
      await fixtures().listForItem({
        itemId,
        limit: optNum(args, 'limit'),
        offset: optNum(args, 'offset'),
      })
    );
  },
};

export const fixtureTools: readonly ToolDef[] = [
  fixturesList,
  fixturesGet,
  ...fixtureWriteTools,
  fixturesListForItem,
];
