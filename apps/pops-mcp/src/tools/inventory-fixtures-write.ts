import { getClient } from '../client.js';
import { copyNullStr, copyOptStr, ok, optStr, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

type FixturePatch = Parameters<
  ReturnType<typeof getClient>['inventory']['fixtures']['update']['mutate']
>[0]['data'];

function buildFixturePatch(args: Record<string, unknown>): FixturePatch {
  const patch: FixturePatch = {};
  copyOptStr(patch, args, 'name');
  copyOptStr(patch, args, 'type');
  copyNullStr(patch, args, 'locationId');
  copyNullStr(patch, args, 'notes');
  return patch;
}

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
    if (!name) return toolError('Missing required field: name');
    const type = reqStr(args, 'type');
    if (!type) return toolError('Missing required field: type');
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
  // Note: empty-patch rejection happens at the tRPC layer via
  // UpdateFixtureSchema.refine, so we don't duplicate the guard here. The
  // backend returns BAD_REQUEST which propagates through the tRPC client.
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const data = buildFixturePatch(args);
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
    if (!id) return toolError('Missing required field: id');
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
    if (!itemId) return toolError('Missing required field: itemId');
    const fixtureId = reqStr(args, 'fixtureId');
    if (!fixtureId) return toolError('Missing required field: fixtureId');
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
    if (!itemId) return toolError('Missing required field: itemId');
    const fixtureId = reqStr(args, 'fixtureId');
    if (!fixtureId) return toolError('Missing required field: fixtureId');
    const result = await getClient().inventory.fixtures.disconnect.mutate({ itemId, fixtureId });
    return ok(result);
  },
};

export const fixtureWriteTools: readonly ToolDef[] = [
  fixturesCreate,
  fixturesUpdate,
  fixturesDelete,
  fixturesConnect,
  fixturesDisconnect,
];
