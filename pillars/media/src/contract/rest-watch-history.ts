/**
 * `watch-history.*` sub-router — watch-event logging + read/progress surface.
 *
 * Wire shapes mirror the legacy `media.watch-history.*` tRPC router
 * (`toWatchHistoryEntry` passthrough + the progress / recent-enrichment
 * handler outputs) so the REST cutover is transparent to the FE.
 *
 * Route order matters: the literal sub-paths (`recent`, `progress/:tvShowId`,
 * `batch-progress`, `batch`) are declared BEFORE `/watch-history/:id` so the
 * Express adapter doesn't capture them as the `:id` segment.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, IdParam, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';
import {
  BatchLogResultSchema,
  BatchLogWatchBody,
  BatchProgressBody,
  BatchProgressEntrySchema,
  LogWatchBody,
  RecentWatchHistoryEntrySchema,
  RecentWatchHistoryQuery,
  TvShowProgressSchema,
  WatchHistoryEntrySchema,
  WatchHistoryQuery,
} from './rest-watch-history-schemas.js';

const c = initContract();

export const mediaWatchHistoryContract = c.router({
  list: {
    method: 'GET',
    path: '/watch-history',
    query: WatchHistoryQuery,
    responses: {
      200: z.object({
        data: z.array(WatchHistoryEntrySchema),
        pagination: PaginationMetaSchema,
      }),
    },
    summary: 'List watch history entries with optional filters and pagination',
  },
  listRecent: {
    method: 'GET',
    path: '/watch-history/recent',
    query: RecentWatchHistoryQuery,
    responses: {
      200: z.object({
        data: z.array(RecentWatchHistoryEntrySchema),
        pagination: PaginationMetaSchema,
      }),
    },
    summary: 'List recent watch history enriched with media metadata',
  },
  progress: {
    method: 'GET',
    path: '/watch-history/progress/:tvShowId',
    pathParams: z.object({ tvShowId: IdParam }),
    responses: { 200: z.object({ data: TvShowProgressSchema }), ...ERR_RESPONSES },
    summary: 'Per-season + overall watch progress for a TV show',
  },
  batchProgress: {
    method: 'POST',
    path: '/watch-history/batch-progress',
    body: BatchProgressBody,
    responses: { 200: z.object({ data: z.array(BatchProgressEntrySchema) }), ...ERR_RESPONSES },
    summary: 'Watch-completion percentage for a batch of TV shows',
  },
  get: {
    method: 'GET',
    path: '/watch-history/:id',
    pathParams: z.object({ id: IdParam }),
    responses: { 200: z.object({ data: WatchHistoryEntrySchema }), ...ERR_RESPONSES },
    summary: 'Get a single watch history entry by id',
  },
  log: {
    method: 'POST',
    path: '/watch-history',
    body: LogWatchBody,
    responses: {
      201: z.object({
        data: WatchHistoryEntrySchema,
        watchlistRemoved: z.boolean(),
        message: z.string(),
      }),
      ...ERR_RESPONSES,
    },
    summary: 'Log a watch event (auto-removes from watchlist on completion)',
  },
  batchLog: {
    method: 'POST',
    path: '/watch-history/batch',
    body: BatchLogWatchBody,
    responses: {
      201: z.object({ data: BatchLogResultSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Batch-log watch events for all aired episodes of a season or show',
  },
  delete: {
    method: 'DELETE',
    path: '/watch-history/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a watch history entry',
  },
});
