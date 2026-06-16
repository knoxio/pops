/**
 * `fixtures.*` sub-router — fixture CRUD plus item↔fixture edges.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';

const c = initContract();

export const FixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  locationId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  lastEditedTime: z.string(),
});

export const ItemFixtureConnectionSchema = z.object({
  id: z.number(),
  itemId: z.string(),
  fixtureId: z.string(),
  createdAt: z.string(),
});

const CreateFixtureBody = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  locationId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateFixtureBody = z
  .object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    locationId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field required' });

const FixtureMutation = z.object({ data: FixtureSchema, message: z.string() });
const ConnectResponse = z.object({ data: ItemFixtureConnectionSchema, message: z.string() });

export const inventoryFixturesContract = c.router({
  list: {
    method: 'GET',
    path: '/fixtures',
    query: z.object({
      locationId: z.string().optional(),
      type: z.string().optional(),
      limit: z.coerce.number().positive().max(500).optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: { 200: z.object({ data: z.array(FixtureSchema), total: z.number() }) },
    summary: 'List fixtures with optional filters',
  },
  get: {
    method: 'GET',
    path: '/fixtures/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: FixtureSchema }), ...ERR_RESPONSES },
    summary: 'Get a single fixture',
  },
  create: {
    method: 'POST',
    path: '/fixtures',
    body: CreateFixtureBody,
    responses: { 201: FixtureMutation, ...ERR_RESPONSES },
    summary: 'Create a fixture',
  },
  update: {
    method: 'PATCH',
    path: '/fixtures/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateFixtureBody,
    responses: { 200: FixtureMutation, ...ERR_RESPONSES },
    summary: 'Update a fixture',
  },
  delete: {
    method: 'DELETE',
    path: '/fixtures/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a fixture',
  },
  connect: {
    method: 'POST',
    path: '/items/:itemId/fixtures/:fixtureId',
    pathParams: z.object({ itemId: z.string(), fixtureId: z.string() }),
    body: z.object({}).optional(),
    responses: { 201: ConnectResponse, ...ERR_RESPONSES },
    summary: 'Connect an item to a fixture',
  },
  disconnect: {
    method: 'DELETE',
    path: '/items/:itemId/fixtures/:fixtureId',
    pathParams: z.object({ itemId: z.string(), fixtureId: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Disconnect an item from a fixture',
  },
  listForItem: {
    method: 'GET',
    path: '/items/:itemId/fixtures',
    pathParams: z.object({ itemId: z.string() }),
    query: z.object({
      limit: z.coerce.number().positive().max(500).optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: {
      200: z.object({
        data: z.array(ItemFixtureConnectionSchema),
        pagination: PaginationMetaSchema,
      }),
    },
    summary: 'List fixtures connected to an item',
  },
});
