/**
 * ts-rest contract for `cerebrum.engrams.*`.
 *
 * Engrams are Markdown documents on disk indexed into SQLite. This sub-router
 * is the CRUD + link surface. Non-identity domain — served on the
 * docker-network trust boundary with no per-request auth (parity with
 * templates / plexus).
 *
 * Typed/array inputs (`create`, `update`, `list`) ride in POST/PATCH bodies
 * rather than the query string (mirrors the food + plexus precedent). `get` /
 * `delete` carry only the id in the path. Links are modelled as a sub-resource
 * of the source engram.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { engramIdSchema, engramSchema, errorBodySchema } from './rest-schemas.js';

const c = initContract();

const ENGRAM_STATUSES = ['active', 'archived', 'consolidated', 'stale'] as const;

const customFieldsSchema = z.record(z.string(), z.unknown());

const sortSchema = z.object({
  field: z.enum(['created_at', 'modified_at', 'title']),
  direction: z.enum(['asc', 'desc']),
});

const createBody = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  // At least one scope is required by the frontmatter contract; a template may
  // inject `default_scopes`, so `scopes` itself may be omitted — but never an
  // empty array.
  scopes: z.array(z.string().min(1)).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  template: z.string().min(1).optional(),
  customFields: customFieldsSchema.optional(),
  source: z.string().min(1).optional(),
  links: z.array(engramIdSchema).optional(),
});

const updateBody = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  scopes: z.array(z.string().min(1)).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  customFields: customFieldsSchema.optional(),
  status: z.enum(ENGRAM_STATUSES).optional(),
  template: z.string().min(1).optional(),
});

const searchBody = z.object({
  type: z.string().optional(),
  scopes: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
  ids: z.array(engramIdSchema).optional(),
  status: z.enum(ENGRAM_STATUSES).optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
  sort: sortSchema.optional(),
});

const idParams = z.object({ id: engramIdSchema });

export const cerebrumEngramsContract = c.router({
  create: {
    method: 'POST',
    path: '/engrams',
    summary: 'Create an engram (optionally scaffolded from a template).',
    body: createBody,
    responses: {
      200: z.object({ engram: engramSchema }),
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
  get: {
    method: 'GET',
    path: '/engrams/:id',
    summary: 'Get an engram and its Markdown body.',
    pathParams: idParams,
    responses: {
      200: z.object({ engram: engramSchema, body: z.string() }),
      404: errorBodySchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/engrams/:id',
    summary: 'Update an engram (title/body/scopes/tags/status/template).',
    pathParams: idParams,
    body: updateBody,
    responses: {
      200: z.object({ engram: engramSchema }),
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/engrams/:id',
    summary: 'Archive an engram (soft delete — moves the file under .archive/).',
    pathParams: idParams,
    body: z.object({}).optional(),
    responses: {
      200: z.object({ success: z.literal(true) }),
      404: errorBodySchema,
    },
  },
  list: {
    method: 'POST',
    path: '/engrams/search',
    summary: 'List engrams matching the supplied filters, with a total count.',
    body: searchBody,
    responses: {
      200: z.object({ engrams: z.array(engramSchema), total: z.number().int() }),
    },
  },
  link: {
    method: 'POST',
    path: '/engrams/:sourceId/links',
    summary: 'Create a bidirectional link from one engram to another.',
    pathParams: z.object({ sourceId: engramIdSchema }),
    body: z.object({ targetId: engramIdSchema }),
    responses: {
      200: z.object({ success: z.literal(true) }),
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
  unlink: {
    method: 'DELETE',
    path: '/engrams/:sourceId/links/:targetId',
    summary: 'Remove the link between two engrams.',
    pathParams: z.object({ sourceId: engramIdSchema, targetId: engramIdSchema }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ success: z.literal(true) }),
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
});
