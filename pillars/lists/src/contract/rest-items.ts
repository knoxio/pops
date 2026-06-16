/**
 * Item-level CRUD + bulk operations — `items.*` sub-router of the lists
 * REST contract. Split from `rest.ts` to keep per-file size below the
 * lint threshold.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ErrorBodySchema,
  ItemAddBodySchema,
  OkSchema,
  PathPositiveInt,
  PositiveInt,
} from './rest-schemas.js';

const c = initContract();

export const listsItemsContract = c.router({
  add: {
    method: 'POST',
    path: '/lists/:listId/items',
    pathParams: z.object({ listId: PathPositiveInt }),
    body: ItemAddBodySchema,
    responses: {
      201: z.object({ id: PositiveInt, position: z.number().int().nonnegative() }),
      400: ErrorBodySchema,
      404: ErrorBodySchema,
    },
    summary: 'Add an item to a list',
  },
  bulkAdd: {
    method: 'POST',
    path: '/lists/:listId/items/bulk',
    pathParams: z.object({ listId: PathPositiveInt }),
    body: z.object({ items: z.array(ItemAddBodySchema).min(1) }),
    responses: {
      201: z.object({ addedIds: z.array(PositiveInt) }),
      400: ErrorBodySchema,
      404: ErrorBodySchema,
    },
    summary: 'Add many items in one transaction',
  },
  update: {
    method: 'PATCH',
    path: '/items/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z
      .object({
        label: z.string().trim().min(1).optional(),
        qty: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .refine(
        (v) =>
          v.label !== undefined ||
          v.qty !== undefined ||
          v.unit !== undefined ||
          v.notes !== undefined,
        { message: 'patch must include at least one field besides id' }
      ),
    responses: { 200: OkSchema, 400: ErrorBodySchema, 404: ErrorBodySchema },
    summary: 'Patch a list item',
  },
  check: {
    method: 'POST',
    path: '/items/:id/check',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ ok: z.literal(true), checkedAt: z.string() }),
      404: ErrorBodySchema,
    },
    summary: 'Mark an item as checked',
  },
  uncheck: {
    method: 'POST',
    path: '/items/:id/uncheck',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Mark an item as unchecked',
  },
  remove: {
    method: 'DELETE',
    path: '/items/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema },
    summary: 'Remove an item (idempotent)',
  },
  reorder: {
    method: 'POST',
    path: '/lists/:listId/items/reorder',
    pathParams: z.object({ listId: PathPositiveInt }),
    body: z.object({ orderedIds: z.array(PositiveInt) }),
    responses: {
      200: z.discriminatedUnion('ok', [
        z.object({ ok: z.literal(true) }),
        z.object({ ok: z.literal(false), reason: z.literal('BadIds') }),
      ]),
    },
    summary: 'Reorder items within a list',
  },
  uncheckAll: {
    method: 'POST',
    path: '/lists/:listId/items/uncheck-all',
    pathParams: z.object({ listId: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ ok: z.literal(true), count: z.number().int().nonnegative() }),
    },
    summary: 'Uncheck every checked item in a list',
  },
  removeChecked: {
    method: 'DELETE',
    path: '/lists/:listId/items/checked',
    pathParams: z.object({ listId: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({
        ok: z.literal(true),
        removedCount: z.number().int().nonnegative(),
      }),
    },
    summary: 'Hard-delete every checked item in a list',
  },
});
