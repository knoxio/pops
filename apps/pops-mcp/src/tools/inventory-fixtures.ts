import { getClient } from '../client.js';
import { nullStr, ok, optNum, optStr, reqStr, toolError } from './utils.js';

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

const fixturesCreate: ToolDef = {
  name: 'inventory.fixtures.create',
  description:
    'Create a new fixture (a non-owned infrastructure object that items can be connected to).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Fixture name (e.g. "Living Room Outlet A")' },
      type: {
        type: 'string',
        description: 'Fixture type (e.g. "outlet", "patch_panel", "cable_run")',
      },
      locationId: { type: 'string', description: 'Location ID (optional)' },
      notes: { type: 'string', description: 'Free-text notes (optional)' },
    },
    required: ['name', 'type'],
  },
  handler: async (args) => {
    const name = reqStr(args, 'name');
    const type = reqStr(args, 'type');
    if (!name) return toolError('Invalid "name"');
    if (!type) return toolError('Invalid "type"');
    const result = await getClient().inventory.fixtures.create.mutate({
      name,
      type,
      locationId: optStr(args, 'locationId'),
      notes: optStr(args, 'notes'),
    });
    return ok(result);
  },
};

const fixturesUpdate: ToolDef = {
  name: 'inventory.fixtures.update',
  description:
    'Update a fixture. Omit a field to leave it unchanged; pass null for locationId or notes to clear them.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Fixture ID' },
      name: { type: 'string', description: 'New name' },
      type: { type: 'string', description: 'New type' },
      locationId: { type: ['string', 'null'], description: 'New location ID, or null to clear' },
      notes: { type: ['string', 'null'], description: 'New notes, or null to clear' },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Invalid "id"');
    const data: Record<string, unknown> = {};
    const name = optStr(args, 'name');
    if (name !== undefined) data['name'] = name;
    const type = optStr(args, 'type');
    if (type !== undefined) data['type'] = type;
    const locationId = nullStr(args, 'locationId');
    if (locationId !== undefined) data['locationId'] = locationId;
    const notes = nullStr(args, 'notes');
    if (notes !== undefined) data['notes'] = notes;
    const result = await getClient().inventory.fixtures.update.mutate({ id, data });
    return ok(result);
  },
};

const fixturesDelete: ToolDef = {
  name: 'inventory.fixtures.delete',
  description: 'Delete a fixture. All item connections to this fixture are removed automatically.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Fixture ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Invalid "id"');
    const result = await getClient().inventory.fixtures.delete.mutate({ id });
    return ok(result);
  },
};

const fixturesConnect: ToolDef = {
  name: 'inventory.fixtures.connect',
  description: 'Connect an inventory item to a fixture (e.g. a lamp plugged into an outlet).',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: 'Inventory item ID' },
      fixtureId: { type: 'string', description: 'Fixture ID' },
    },
    required: ['itemId', 'fixtureId'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    const fixtureId = reqStr(args, 'fixtureId');
    if (!itemId) return toolError('Invalid "itemId"');
    if (!fixtureId) return toolError('Invalid "fixtureId"');
    const result = await getClient().inventory.fixtures.connect.mutate({ itemId, fixtureId });
    return ok(result);
  },
};

const fixturesDisconnect: ToolDef = {
  name: 'inventory.fixtures.disconnect',
  description: 'Disconnect an inventory item from a fixture.',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: 'Inventory item ID' },
      fixtureId: { type: 'string', description: 'Fixture ID' },
    },
    required: ['itemId', 'fixtureId'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    const fixtureId = reqStr(args, 'fixtureId');
    if (!itemId) return toolError('Invalid "itemId"');
    if (!fixtureId) return toolError('Invalid "fixtureId"');
    const result = await getClient().inventory.fixtures.disconnect.mutate({ itemId, fixtureId });
    return ok(result);
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
  fixturesCreate,
  fixturesUpdate,
  fixturesDelete,
  fixturesConnect,
  fixturesDisconnect,
  fixturesListForItem,
];
