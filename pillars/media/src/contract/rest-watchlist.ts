/**
 * `watchlist.*` sub-router — media watchlist CRUD + reorder.
 *
 * `title` / `posterUrl` are nullable in the contract: the handlers serve
 * `null` until the enrichment join is wired.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, IdParam, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';

const c = initContract();

const MEDIA_TYPES = ['movie', 'tv_show'] as const;

export const WatchlistEntrySchema = z.object({
  id: z.number(),
  mediaType: z.string(),
  mediaId: z.number(),
  priority: z.number().nullable(),
  notes: z.string().nullable(),
  source: z.string().nullable(),
  plexRatingKey: z.string().nullable(),
  addedAt: z.string(),
  title: z.string().nullable(),
  posterUrl: z.string().nullable(),
});

const WatchlistQuery = z.object({
  mediaType: z.enum(MEDIA_TYPES).optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

const AddToWatchlistBody = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.number().int().positive(),
  priority: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateWatchlistBody = z.object({
  priority: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const ReorderBody = z.object({
  items: z.array(z.object({ id: z.number(), priority: z.number().int().min(0) })),
});

const StatusQuery = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  mediaId: z.coerce.number().int().positive(),
});

const WatchlistMutation = z.object({ data: WatchlistEntrySchema, message: z.string() });

export const mediaWatchlistContract = c.router({
  list: {
    method: 'GET',
    path: '/watchlist',
    query: WatchlistQuery,
    responses: {
      200: z.object({ data: z.array(WatchlistEntrySchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List watchlist entries with optional mediaType filter and pagination',
  },
  status: {
    method: 'GET',
    path: '/watchlist/status',
    query: StatusQuery,
    responses: { 200: z.object({ onWatchlist: z.boolean(), entryId: z.number().nullable() }) },
    summary: 'Check whether a media item is on the watchlist',
  },
  get: {
    method: 'GET',
    path: '/watchlist/:id',
    pathParams: z.object({ id: IdParam }),
    responses: { 200: z.object({ data: WatchlistEntrySchema }), ...ERR_RESPONSES },
    summary: 'Get a single watchlist entry by id',
  },
  add: {
    method: 'POST',
    path: '/watchlist',
    body: AddToWatchlistBody,
    responses: {
      201: z.object({ data: WatchlistEntrySchema, created: z.boolean(), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Add an item to the watchlist (idempotent on mediaType+mediaId)',
  },
  reorder: {
    method: 'POST',
    path: '/watchlist/reorder',
    body: ReorderBody,
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Batch-reorder watchlist items by priority',
  },
  update: {
    method: 'PATCH',
    path: '/watchlist/:id',
    pathParams: z.object({ id: IdParam }),
    body: UpdateWatchlistBody,
    responses: { 200: WatchlistMutation, ...ERR_RESPONSES },
    summary: 'Update a watchlist entry',
  },
  remove: {
    method: 'DELETE',
    path: '/watchlist/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Remove an entry from the watchlist',
  },
});
