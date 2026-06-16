/**
 * `locations.*` sub-router — location hierarchy CRUD plus tree / path /
 * children projections and the delete-confirmation handshake.
 *
 * `tree` is declared before `get` so its literal `/locations/tree` route
 * registers ahead of the `/locations/:id` param route and is never
 * shadowed by it.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, MessageSchema, QueryBool } from './rest-schemas.js';

const c = initContract();

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  sortOrder: z.number(),
});

export interface LocationTreeNodeShape {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationTreeNodeShape[];
}

export const LocationTreeNodeSchema: z.ZodType<LocationTreeNodeShape> = z
  .lazy(() => LocationSchema.extend({ children: z.array(LocationTreeNodeSchema) }))
  .meta({ id: 'LocationTreeNode' });

const DeleteLocationStatsSchema = z.object({
  childCount: z.number(),
  descendantCount: z.number(),
  itemCount: z.number(),
  totalItemCount: z.number(),
});

const CreateLocationBody = z.object({
  name: z.string().min(1, 'Name is required'),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});

const UpdateLocationBody = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

const LocationMutation = z.object({ data: LocationSchema, message: z.string() });

export const inventoryLocationsContract = c.router({
  list: {
    method: 'GET',
    path: '/locations',
    responses: { 200: z.object({ data: z.array(LocationSchema), total: z.number() }) },
    summary: 'List all locations (flat)',
  },
  tree: {
    method: 'GET',
    path: '/locations/tree',
    responses: { 200: z.object({ data: z.array(LocationTreeNodeSchema) }) },
    summary: 'Location hierarchy as a nested tree',
  },
  get: {
    method: 'GET',
    path: '/locations/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: LocationSchema }), ...ERR_RESPONSES },
    summary: 'Get a single location',
  },
  getPath: {
    method: 'GET',
    path: '/locations/:id/path',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: z.array(LocationSchema) }), ...ERR_RESPONSES },
    summary: 'Ancestor chain (root → location) for breadcrumbs',
  },
  children: {
    method: 'GET',
    path: '/locations/:id/children',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: z.array(LocationSchema) }) },
    summary: 'Direct child locations of a location',
  },
  deleteStats: {
    method: 'GET',
    path: '/locations/:id/delete-stats',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: DeleteLocationStatsSchema }), ...ERR_RESPONSES },
    summary: 'Counts of children / items affected by deleting a location',
  },
  create: {
    method: 'POST',
    path: '/locations',
    body: CreateLocationBody,
    responses: { 201: LocationMutation, ...ERR_RESPONSES },
    summary: 'Create a location',
  },
  update: {
    method: 'PATCH',
    path: '/locations/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateLocationBody,
    responses: { 200: LocationMutation, ...ERR_RESPONSES },
    summary: 'Update a location',
  },
  delete: {
    method: 'DELETE',
    path: '/locations/:id',
    pathParams: z.object({ id: z.string() }),
    query: z.object({ force: QueryBool.optional() }),
    body: z.object({}).optional(),
    responses: {
      200: z.union([
        MessageSchema,
        z.object({ requiresConfirmation: z.literal(true), stats: DeleteLocationStatsSchema }),
      ]),
      ...ERR_RESPONSES,
    },
    summary: 'Delete a location; without force, returns confirmation stats when non-empty',
  },
});
