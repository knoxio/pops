import { getPillar } from '../pillar-client.js';
import { copyOptStr, mapCallResult, nullStr, optBool, optNum, reqStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './index.js';

type Location = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

type LocationTreeNode = Location & { children: LocationTreeNode[] };

type LocationPatch = {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
};

type DeleteResponse =
  | { message: string }
  | {
      requiresConfirmation: true;
      stats: {
        childCount: number;
        descendantCount: number;
        itemCount: number;
        totalItemCount: number;
      };
    };

type InventoryShape = {
  inventory: {
    locations: {
      tree: () => { data: LocationTreeNode[] };
      list: () => { data: Location[]; total: number };
      create: (input: { name: string; parentId?: string | null; sortOrder?: number }) => {
        data: Location;
        message: string;
      };
      update: (input: { id: string; data: LocationPatch }) => { data: Location; message: string };
      delete: (input: { id: string; force: boolean }) => DeleteResponse;
    };
  };
};

type LocationsHandle = PillarHandle<InventoryShape>['inventory']['locations'];

function locations(): LocationsHandle {
  return getPillar<InventoryShape>('inventory').inventory.locations;
}

function buildLocationPatch(args: Record<string, unknown>): LocationPatch {
  const patch: LocationPatch = {};
  copyOptStr(patch, args, 'name');
  if ('parentId' in args) {
    const parentId = nullStr(args, 'parentId');
    if (parentId !== undefined) patch.parentId = parentId;
  }
  const sortOrder = optNum(args, 'sortOrder');
  if (sortOrder !== undefined) patch.sortOrder = sortOrder;
  return patch;
}

const locationTree: ToolDef = {
  name: 'inventory.locations.tree',
  description:
    'Get the full location hierarchy as a nested tree. Returns all locations with their children.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => mapCallResult(await locations().tree()),
};

const locationsList: ToolDef = {
  name: 'inventory.locations.list',
  description: 'List all locations as a flat array.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => mapCallResult(await locations().list()),
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
    const input: { name: string; parentId?: string | null; sortOrder?: number } = { name };
    const parentId = nullStr(args, 'parentId');
    if (parentId !== undefined) input.parentId = parentId;
    const sortOrder = optNum(args, 'sortOrder');
    if (sortOrder !== undefined) input.sortOrder = sortOrder;
    return mapCallResult(await locations().create(input));
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
    const data = buildLocationPatch(args);
    return mapCallResult(await locations().update({ id, data }));
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
    return mapCallResult(await locations().delete({ id, force: optBool(args, 'force') ?? false }));
  },
};

export const locationTools: readonly ToolDef[] = [
  locationTree,
  locationsList,
  locationsCreate,
  locationsUpdate,
  locationsDelete,
];
