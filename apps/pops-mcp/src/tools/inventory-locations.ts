import { getClient } from '../client.js';
import { nullStr, ok, optBool, optStr, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

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

const locationsCreate: ToolDef = {
  name: 'inventory.locations.create',
  description:
    'Create a new location. Use parentId to nest it under an existing location (omit or null for a root location). Returns the created location including its id.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Location name (required)' },
      parentId: {
        type: ['string', 'null'],
        description: 'Parent location ID — omit or null for a root location',
      },
      sortOrder: { type: 'number', description: 'Sort position among siblings (default 0)' },
    },
    required: ['name'],
  },
  handler: async (args) => {
    const name = reqStr(args, 'name');
    if (!name) return toolError('Missing required field: name');
    const result = await getClient().inventory.locations.create.mutate({
      name,
      parentId: nullStr(args, 'parentId'),
      sortOrder: typeof args['sortOrder'] === 'number' ? args['sortOrder'] : undefined,
    });
    return ok(result.data);
  },
};

const locationsUpdate: ToolDef = {
  name: 'inventory.locations.update',
  description:
    'Update an existing location. Only provided fields are changed. Pass parentId: null to make a location a root node.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Location ID' },
      name: { type: 'string', description: 'New name' },
      parentId: {
        type: ['string', 'null'],
        description: 'New parent location ID — null to promote to root',
      },
      sortOrder: { type: 'number', description: 'New sort position among siblings' },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');

    const data: { name?: string; parentId?: string | null; sortOrder?: number } = {};
    const name = optStr(args, 'name');
    if (name !== undefined) data.name = name;
    if ('parentId' in args) data.parentId = nullStr(args, 'parentId');
    if (typeof args['sortOrder'] === 'number') data.sortOrder = args['sortOrder'];

    const result = await getClient().inventory.locations.update.mutate({ id, data });
    return ok(result.data);
  },
};

const locationsDelete: ToolDef = {
  name: 'inventory.locations.delete',
  description:
    'Delete a location. Without force, returns { requiresConfirmation: true, stats } when the location has children or items — re-call with force: true once the user confirms. Child locations are cascade-deleted; items become unlocated (not deleted).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Location ID' },
      force: {
        type: 'boolean',
        description: 'Delete even when non-empty (default false)',
      },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const result = await getClient().inventory.locations.delete.mutate({
      id,
      force: optBool(args, 'force') ?? false,
    });
    // Two possible shapes: { requiresConfirmation: true, stats } when items exist, { message } on success
    return ok(result);
  },
};

export const locationTools: readonly ToolDef[] = [
  locationTree,
  locationsList,
  locationsCreate,
  locationsUpdate,
  locationsDelete,
];
