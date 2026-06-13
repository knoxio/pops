import { getPillar } from '../pillar-client.js';
import { copyNullStr, copyOptStr, mapCallResult, optStr, reqStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './index.js';

export type FixturePatch = {
  name?: string;
  type?: string;
  locationId?: string | null;
  notes?: string | null;
};

export type FixturesShape = {
  inventory: {
    fixtures: {
      list: (input: {
        locationId?: string;
        type?: string;
        limit?: number;
        offset?: number;
      }) => unknown;
      get: (input: { id: string }) => unknown;
      listForItem: (input: { itemId: string; limit?: number; offset?: number }) => unknown;
      create: (input: {
        name: string;
        type: string;
        locationId?: string;
        notes?: string;
      }) => unknown;
      update: (input: { id: string; data: FixturePatch }) => unknown;
      delete: (input: { id: string }) => unknown;
      connect: (input: { itemId: string; fixtureId: string }) => unknown;
      disconnect: (input: { itemId: string; fixtureId: string }) => unknown;
    };
  };
};

export function fixtures(): PillarHandle<FixturesShape>['inventory']['fixtures'] {
  return getPillar<FixturesShape>('inventory').inventory.fixtures;
}

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
    const input: { name: string; type: string; locationId?: string; notes?: string } = {
      name,
      type,
    };
    const locationId = optStr(args, 'locationId');
    if (locationId !== undefined) input.locationId = locationId;
    const notes = optStr(args, 'notes');
    if (notes !== undefined) input.notes = notes;
    return mapCallResult(await fixtures().create(input));
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
  // Empty-patch rejection happens at the tRPC layer via UpdateFixtureSchema.refine.
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const data = buildFixturePatch(args);
    return mapCallResult(await fixtures().update({ id, data }));
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
    return mapCallResult(await fixtures().delete({ id }));
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
    return mapCallResult(await fixtures().connect({ itemId, fixtureId }));
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
    return mapCallResult(await fixtures().disconnect({ itemId, fixtureId }));
  },
};

export const fixtureWriteTools: readonly ToolDef[] = [
  fixturesCreate,
  fixturesUpdate,
  fixturesDelete,
  fixturesConnect,
  fixturesDisconnect,
];
