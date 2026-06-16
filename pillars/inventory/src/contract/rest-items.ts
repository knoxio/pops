/**
 * `items.*` sub-router of the inventory REST contract — item CRUD plus
 * the asset-id lookup / aggregate helpers.
 *
 * Asset-id + stats lookups sit under 3-segment paths
 * (`/items/search/...`, `/items/stats/...`) so they can never be
 * shadowed by the 2-segment `/items/:id` route regardless of
 * registration order.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ERR_RESPONSES,
  MessageSchema,
  NonEmptyString,
  PaginationMetaSchema,
  QueryBool,
} from './rest-schemas.js';

const c = initContract();

export const InventoryItemSchema = z.object({
  id: z.string(),
  itemName: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  itemId: z.string().nullable(),
  room: z.string().nullable(),
  location: z.string().nullable(),
  type: z.string().nullable(),
  condition: z.string().nullable(),
  inUse: z.boolean(),
  deductible: z.boolean(),
  purchaseDate: z.string().nullable(),
  warrantyExpires: z.string().nullable(),
  replacementValue: z.number().nullable(),
  resaleValue: z.number().nullable(),
  purchasePrice: z.number().nullable(),
  purchaseTransactionId: z.string().nullable(),
  purchasedFromId: z.string().nullable(),
  purchasedFromName: z.string().nullable(),
  assetId: z.string().nullable(),
  notes: z.string().nullable(),
  locationId: z.string().nullable(),
  lastEditedTime: z.string(),
});

const CreateItemBody = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  inUse: z.boolean().optional().default(false),
  deductible: z.boolean().optional().default(false),
  purchaseDate: z.string().nullable().optional(),
  warrantyExpires: z.string().nullable().optional(),
  replacementValue: z.number().nullable().optional(),
  resaleValue: z.number().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  purchaseTransactionId: z.string().nullable().optional(),
  purchasedFromId: z.string().nullable().optional(),
  purchasedFromName: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});

const UpdateItemBody = z.object({
  itemName: z.string().min(1, 'Item name cannot be empty').optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  inUse: z.boolean().optional(),
  deductible: z.boolean().optional(),
  purchaseDate: z.string().nullable().optional(),
  warrantyExpires: z.string().nullable().optional(),
  replacementValue: z.number().nullable().optional(),
  resaleValue: z.number().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  purchaseTransactionId: z.string().nullable().optional(),
  purchasedFromId: z.string().nullable().optional(),
  purchasedFromName: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});

const ListQuery = z.object({
  search: z.string().optional(),
  room: z.string().optional(),
  type: z.string().optional(),
  condition: z.string().optional(),
  inUse: z.enum(['true', 'false']).optional(),
  deductible: z.enum(['true', 'false']).optional(),
  locationId: z.string().optional(),
  includeChildren: QueryBool.optional(),
  assetId: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

const ItemData = z.object({ data: InventoryItemSchema });
const ItemMutation = z.object({ data: InventoryItemSchema, message: z.string() });

export const inventoryItemsContract = c.router({
  list: {
    method: 'GET',
    path: '/items',
    query: ListQuery,
    responses: {
      200: z.object({
        data: z.array(InventoryItemSchema),
        pagination: PaginationMetaSchema,
        totals: z.object({ totalReplacementValue: z.number(), totalResaleValue: z.number() }),
      }),
    },
    summary: 'List inventory items with filters, pagination and value totals',
  },
  searchByAssetId: {
    method: 'GET',
    path: '/items/search/by-asset-id',
    query: z.object({ assetId: NonEmptyString }),
    responses: { 200: z.object({ data: InventoryItemSchema.nullable() }) },
    summary: 'Find an item by exact asset id (case-insensitive); null if absent',
  },
  countByAssetPrefix: {
    method: 'GET',
    path: '/items/stats/count-by-asset-prefix',
    query: z.object({ prefix: NonEmptyString }),
    responses: { 200: z.object({ data: z.number() }) },
    summary: 'Count items whose asset id starts with a prefix (case-insensitive)',
  },
  distinctTypes: {
    method: 'GET',
    path: '/items/stats/distinct-types',
    responses: { 200: z.object({ data: z.array(z.string()) }) },
    summary: 'Distinct non-null item types',
  },
  get: {
    method: 'GET',
    path: '/items/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: ItemData, ...ERR_RESPONSES },
    summary: 'Get a single inventory item',
  },
  create: {
    method: 'POST',
    path: '/items',
    body: CreateItemBody,
    responses: { 201: ItemMutation, ...ERR_RESPONSES },
    summary: 'Create an inventory item',
  },
  update: {
    method: 'PATCH',
    path: '/items/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateItemBody,
    responses: { 200: ItemMutation, ...ERR_RESPONSES },
    summary: 'Update an inventory item',
  },
  delete: {
    method: 'DELETE',
    path: '/items/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete an inventory item',
  },
});
