/**
 * List-header CRUD + aggregate index — `list.*` sub-router of the lists
 * REST contract. Split from `rest.ts` to keep per-file size below the
 * lint threshold.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ErrorBodySchema,
  KIND_ENUM,
  ListAggregateRowSchema,
  ListItemRowSchema,
  ListRowSchema,
  OkSchema,
  PathPositiveInt,
  PositiveInt,
  SORT_ENUM,
} from './rest-schemas.js';

const c = initContract();

export const listsListContract = c.router({
  listAggregate: {
    method: 'GET',
    path: '/lists',
    query: z.object({
      kinds: z
        .preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(KIND_ENUM))
        .optional(),
      includeArchived: z.coerce.boolean().optional(),
      sort: SORT_ENUM.optional(),
    }),
    responses: {
      200: z.object({ items: z.array(ListAggregateRowSchema) }),
    },
    summary: 'Aggregate list view for the lists index page',
  },
  get: {
    method: 'GET',
    path: '/lists/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    responses: {
      200: z.object({ list: ListRowSchema, items: z.array(ListItemRowSchema) }).nullable(),
    },
    summary: 'Get a single list header plus its items in one round-trip',
  },
  create: {
    method: 'POST',
    path: '/lists',
    body: z.object({
      name: z.string().trim().min(1),
      kind: KIND_ENUM,
      ownerApp: z.string().trim().min(1).optional(),
    }),
    responses: {
      201: z.object({ id: PositiveInt }),
      400: ErrorBodySchema,
    },
    summary: 'Create a list',
  },
  update: {
    method: 'PATCH',
    path: '/lists/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z
      .object({
        name: z.string().trim().min(1).optional(),
        kind: KIND_ENUM.optional(),
      })
      .refine((v) => v.name !== undefined || v.kind !== undefined, {
        message: 'patch must include name or kind',
      }),
    responses: {
      200: z.discriminatedUnion('ok', [
        z.object({ ok: z.literal(true) }),
        z.object({ ok: z.literal(false), reason: z.literal('NotFound') }),
      ]),
      400: ErrorBodySchema,
    },
    summary: 'Patch a list header (name and/or kind)',
  },
  archive: {
    method: 'POST',
    path: '/lists/:id/archive',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Archive a list',
  },
  unarchive: {
    method: 'POST',
    path: '/lists/:id/unarchive',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Unarchive a list',
  },
  delete: {
    method: 'DELETE',
    path: '/lists/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: OkSchema, 404: ErrorBodySchema },
    summary: 'Hard-delete a list (cascades items)',
  },
});
