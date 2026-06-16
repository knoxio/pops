/**
 * `wishlist.*` sub-router — wish-list item CRUD.
 *
 * Response/body schemas mirror the legacy `finance.wishlist.*` tRPC wire
 * shapes (`toWishListItem` + the create/update zod inputs) so the REST
 * cutover is transparent to the FE.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, LimitQuery, MessageSchema, OffsetQuery } from './rest-schemas.js';
import { WISH_LIST_PRIORITIES } from './types/wish-list-item.js';

const c = initContract();

/** Wire shape served by the wish-list handlers. */
export const WishListItemSchema = z.object({
  id: z.string(),
  item: z.string(),
  targetAmount: z.number().nullable(),
  saved: z.number().nullable(),
  remainingAmount: z.number().nullable(),
  priority: z.string().nullable(),
  url: z.string().nullable(),
  notes: z.string().nullable(),
  lastEditedTime: z.string(),
});

const CreateWishListItemBody = z.object({
  item: z.string().min(1, 'Item is required'),
  targetAmount: z.number().nullable().optional(),
  saved: z.number().nullable().optional(),
  priority: z.enum(WISH_LIST_PRIORITIES).nullable().optional(),
  url: z.string().url('Invalid URL').nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateWishListItemBody = z.object({
  item: z.string().min(1, 'Item cannot be empty').optional(),
  targetAmount: z.number().nullable().optional(),
  saved: z.number().nullable().optional(),
  priority: z.enum(WISH_LIST_PRIORITIES).nullable().optional(),
  url: z.string().url('Invalid URL').nullable().optional(),
  notes: z.string().nullable().optional(),
});

const WishListQuery = z.object({
  search: z.string().optional(),
  priority: z.string().optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

const WishListItemMutation = z.object({ data: WishListItemSchema, message: z.string() });

export const financeWishlistContract = c.router({
  list: {
    method: 'GET',
    path: '/wishlist',
    query: WishListQuery,
    responses: {
      200: z.object({
        data: z.array(WishListItemSchema),
        pagination: z.object({
          total: z.number(),
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    },
    summary: 'List wish-list items with optional search / priority filters and pagination',
  },
  get: {
    method: 'GET',
    path: '/wishlist/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: WishListItemSchema }), ...ERR_RESPONSES },
    summary: 'Get a single wish-list item',
  },
  create: {
    method: 'POST',
    path: '/wishlist',
    body: CreateWishListItemBody,
    responses: { 201: WishListItemMutation, ...ERR_RESPONSES },
    summary: 'Create a wish-list item',
  },
  update: {
    method: 'PATCH',
    path: '/wishlist/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateWishListItemBody,
    responses: { 200: WishListItemMutation, ...ERR_RESPONSES },
    summary: 'Update a wish-list item',
  },
  delete: {
    method: 'DELETE',
    path: '/wishlist/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a wish-list item',
  },
});
