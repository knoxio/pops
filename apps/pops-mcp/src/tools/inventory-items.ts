import { getClient } from '../client.js';
import { nullNum, nullStr, ok, optBool, reqStr, toolError } from './utils.js';

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
    properties: { id: { type: 'string', description: 'Item ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const result = await getClient().inventory.items.get.query({ id });
    return ok(result.data);
  },
};

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
    const result = await getClient().inventory.items.create.mutate({
      itemName,
      brand: nullStr(args, 'brand'),
      model: nullStr(args, 'model'),
      itemId: nullStr(args, 'itemId'),
      room: nullStr(args, 'room'),
      type: nullStr(args, 'type'),
      condition: nullStr(args, 'condition'),
      locationId: nullStr(args, 'locationId'),
      inUse: optBool(args, 'inUse'),
      deductible: optBool(args, 'deductible'),
      assetId: nullStr(args, 'assetId'),
      notes: nullStr(args, 'notes'),
      purchaseDate: nullStr(args, 'purchaseDate'),
      warrantyExpires: nullStr(args, 'warrantyExpires'),
      replacementValue: nullNum(args, 'replacementValue'),
      resaleValue: nullNum(args, 'resaleValue'),
      purchasePrice: nullNum(args, 'purchasePrice'),
      purchasedFromName: nullStr(args, 'purchasedFromName'),
    });
    return ok(result.data);
  },
};

const STR_FIELDS = [
  'itemName',
  'brand',
  'model',
  'itemId',
  'room',
  'type',
  'condition',
  'assetId',
  'notes',
  'purchaseDate',
  'warrantyExpires',
  'purchasedFromName',
  'locationId',
] as const;

const NUM_FIELDS = ['replacementValue', 'resaleValue', 'purchasePrice'] as const;

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

    const data: Record<string, unknown> = {};
    for (const f of STR_FIELDS) {
      const v = nullStr(args, f);
      if (v !== undefined) data[f] = v;
    }
    for (const f of NUM_FIELDS) {
      const v = nullNum(args, f);
      if (v !== undefined) data[f] = v;
    }
    if ('inUse' in args && typeof args['inUse'] === 'boolean') data['inUse'] = args['inUse'];
    if ('deductible' in args && typeof args['deductible'] === 'boolean')
      data['deductible'] = args['deductible'];

    const result = await getClient().inventory.items.update.mutate({
      id,
      data: data as Parameters<
        ReturnType<typeof getClient>['inventory']['items']['update']['mutate']
      >[0]['data'],
    });
    return ok(result.data);
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
    const result = await getClient().inventory.items.delete.mutate({ id });
    return ok(result);
  },
};

export const itemTools: readonly ToolDef[] = [
  itemsList,
  itemGet,
  itemsCreate,
  itemsUpdate,
  itemsDelete,
];
