/**
 * `entities.*` sub-router — plain `entities`-table CRUD.
 *
 * Response/body schemas mirror the legacy `core.entities.*` tRPC wire
 * shapes (`toEntity` + the create/update/query zod inputs) so the REST
 * cutover is transparent to consumers: bare entity rows, `{ data, pagination }`
 * for `list`, and NO `transactionCount` (that finance-owned LEFT JOIN was
 * already dropped in the pillar fold — a consumer that needs a count asks
 * the finance pillar).
 *
 * `ENTITY_TYPES` is inlined here rather than imported from `../db` so the
 * contract stays zod-only and honours the package boundary (consumers see
 * only `.`). It must stay in sync with `db/row-types.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, LimitQuery, MessageSchema, OffsetQuery } from './rest-schemas.js';

const c = initContract();

/** Entity discriminator values. Mirrors `ENTITY_TYPES` in `db/row-types.ts`. */
export const ENTITY_TYPES = [
  'company',
  'person',
  'government',
  'bank',
  'place',
  'brand',
  'organisation',
] as const;

/** Wire shape served by the entities handlers (the `toEntity` mapper output). */
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  abn: z.string().nullable(),
  aliases: z.array(z.string()),
  defaultTransactionType: z.string().nullable(),
  defaultTags: z.array(z.string()),
  notes: z.string().nullable(),
  lastEditedTime: z.string(),
});

const CreateEntityBody = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(ENTITY_TYPES).optional().default('company'),
  abn: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional().default([]),
  defaultTransactionType: z.string().nullable().optional(),
  defaultTags: z.array(z.string()).optional().default([]),
  notes: z.string().nullable().optional(),
});

const UpdateEntityBody = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  type: z.enum(ENTITY_TYPES).optional(),
  abn: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional(),
  defaultTransactionType: z.string().nullable().optional(),
  defaultTags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

const EntityQuery = z.object({
  search: z.string().optional(),
  type: z.enum(ENTITY_TYPES).optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

const EntityMutation = z.object({ data: EntitySchema, message: z.string() });

export const coreEntitiesContract = c.router({
  list: {
    method: 'GET',
    path: '/entities',
    query: EntityQuery,
    responses: {
      200: z.object({
        data: z.array(EntitySchema),
        pagination: z.object({
          total: z.number(),
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    },
    summary: 'List entities with optional search / type filters and pagination',
  },
  get: {
    method: 'GET',
    path: '/entities/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: EntitySchema }), ...ERR_RESPONSES },
    summary: 'Get a single entity',
  },
  create: {
    method: 'POST',
    path: '/entities',
    body: CreateEntityBody,
    responses: { 201: EntityMutation, ...ERR_RESPONSES },
    summary: 'Create an entity',
  },
  update: {
    method: 'PATCH',
    path: '/entities/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateEntityBody,
    responses: { 200: EntityMutation, ...ERR_RESPONSES },
    summary: 'Update an entity',
  },
  delete: {
    method: 'DELETE',
    path: '/entities/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete an entity',
  },
});
