import { getPillar } from '../pillar-client.js';
import {
  copyNullNum,
  copyNullStr,
  copyOptBool,
  copyOptStr,
  mapCallResult,
  reqStr,
  toolError,
} from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './index.js';

export type ItemPatch = {
  itemName?: string;
  brand?: string | null;
  model?: string | null;
  itemId?: string | null;
  room?: string | null;
  type?: string | null;
  condition?: string | null;
  locationId?: string | null;
  assetId?: string | null;
  notes?: string | null;
  purchaseDate?: string | null;
  warrantyExpires?: string | null;
  purchasedFromName?: string | null;
  replacementValue?: number | null;
  resaleValue?: number | null;
  purchasePrice?: number | null;
  inUse?: boolean;
  deductible?: boolean;
};

type ItemCreateInput = ItemPatch & { itemName: string };

export type ItemsShape = {
  inventory: {
    items: {
      list: (input: {
        search?: string;
        locationId?: string;
        includeChildren?: boolean;
        type?: string;
        condition?: string;
        limit?: number;
        offset?: number;
      }) => unknown;
      get: (input: { id: string }) => unknown;
      create: (input: ItemCreateInput) => unknown;
      update: (input: { id: string; data: ItemPatch }) => unknown;
      delete: (input: { id: string }) => unknown;
    };
  };
};

const NULL_STR_FIELDS = [
  'brand',
  'model',
  'itemId',
  'room',
  'type',
  'condition',
  'locationId',
  'assetId',
  'notes',
  'purchaseDate',
  'warrantyExpires',
  'purchasedFromName',
] as const;
const NULL_NUM_FIELDS = ['replacementValue', 'resaleValue', 'purchasePrice'] as const;
const OPT_BOOL_FIELDS = ['inUse', 'deductible'] as const;

export function items(): PillarHandle<ItemsShape>['inventory']['items'] {
  return getPillar<ItemsShape>('inventory').inventory.items;
}

function buildItemPatch(args: Record<string, unknown>): ItemPatch {
  const patch: ItemPatch = {};
  copyOptStr(patch, args, 'itemName');
  for (const k of NULL_STR_FIELDS) copyNullStr(patch, args, k);
  for (const k of NULL_NUM_FIELDS) copyNullNum(patch, args, k);
  for (const k of OPT_BOOL_FIELDS) copyOptBool(patch, args, k);
  return patch;
}

const itemsCreate: ToolDef = {
  name: 'inventory.items.create',
  description:
    'Create a new inventory item. Only itemName is required. Assign to a location via locationId. Returns the full item including its generated id.',
  inputSchema: {
    type: 'object',
    properties: {
      itemName: { type: 'string', description: 'Item name (required)' },
      brand: { type: 'string', description: 'Brand name' },
      model: { type: 'string', description: 'Model name or number' },
      type: { type: 'string', description: 'Category (e.g. "electronics", "furniture")' },
      condition: { type: 'string', description: 'Physical condition (e.g. "good", "new")' },
      locationId: { type: 'string', description: 'Location ID to place the item in' },
      inUse: { type: 'boolean', description: 'Whether the item is currently in use' },
      deductible: { type: 'boolean', description: 'Whether tax deductible' },
      assetId: { type: 'string', description: 'Custom asset ID (e.g. "TV01")' },
      notes: { type: 'string', description: 'Free-form notes (markdown supported)' },
      purchaseDate: { type: 'string', description: 'Purchase date (ISO 8601)' },
      warrantyExpires: { type: 'string', description: 'Warranty expiry date (ISO 8601)' },
      replacementValue: { type: 'number', description: 'Replacement cost in dollars' },
      resaleValue: { type: 'number', description: 'Current resale value in dollars' },
      purchasePrice: { type: 'number', description: 'Original purchase price in dollars' },
      purchasedFromName: { type: 'string', description: 'Seller or merchant name' },
      room: { type: 'string', description: 'Room name (legacy free-text field)' },
      itemId: { type: 'string', description: 'Custom internal item ID' },
    },
    required: ['itemName'],
  },
  handler: async (args) => {
    const itemName = reqStr(args, 'itemName');
    if (!itemName) return toolError('Missing required field: itemName');
    const input: ItemCreateInput = { itemName, ...buildItemPatch(args) };
    return mapCallResult(await items().create(input));
  },
};

const itemsUpdate: ToolDef = {
  name: 'inventory.items.update',
  description:
    'Update an existing inventory item. Only provided fields are changed. Pass null for nullable fields to clear them.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Item ID' },
      itemName: { type: 'string', description: 'New item name' },
      brand: { type: ['string', 'null'], description: 'Brand name (null to clear)' },
      model: { type: ['string', 'null'], description: 'Model name (null to clear)' },
      type: { type: ['string', 'null'], description: 'Category (null to clear)' },
      condition: { type: ['string', 'null'], description: 'Condition (null to clear)' },
      locationId: { type: ['string', 'null'], description: 'Location ID (null to unlocate)' },
      inUse: { type: 'boolean', description: 'Whether item is in use' },
      deductible: { type: 'boolean', description: 'Whether tax deductible' },
      assetId: { type: ['string', 'null'], description: 'Custom asset ID (null to clear)' },
      notes: { type: ['string', 'null'], description: 'Notes (null to clear)' },
      purchaseDate: {
        type: ['string', 'null'],
        description: 'Purchase date ISO 8601 (null to clear)',
      },
      warrantyExpires: {
        type: ['string', 'null'],
        description: 'Warranty expiry ISO 8601 (null to clear)',
      },
      replacementValue: {
        type: ['number', 'null'],
        description: 'Replacement value (null to clear)',
      },
      resaleValue: { type: ['number', 'null'], description: 'Resale value (null to clear)' },
      purchasePrice: { type: ['number', 'null'], description: 'Purchase price (null to clear)' },
      purchasedFromName: { type: ['string', 'null'], description: 'Seller name (null to clear)' },
      room: { type: ['string', 'null'], description: 'Room name (null to clear)' },
      itemId: { type: ['string', 'null'], description: 'Custom item ID (null to clear)' },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const data = buildItemPatch(args);
    return mapCallResult(await items().update({ id, data }));
  },
};

const itemsDelete: ToolDef = {
  name: 'inventory.items.delete',
  description: 'Permanently delete an inventory item by ID.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Item ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await items().delete({ id }));
  },
};

export const itemWriteTools: readonly ToolDef[] = [itemsCreate, itemsUpdate, itemsDelete];
