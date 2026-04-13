/**
 * Watch history tRPC router — procedures for tracking watch events.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { NotFoundError } from '../../../shared/errors.js';
import { paginationMeta } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import {
  BatchLogWatchSchema,
  BatchProgressQuerySchema,
  LogWatchSchema,
  ProgressQuerySchema,
  type RecentWatchHistoryFilters,
  RecentWatchHistoryQuerySchema,
  toWatchHistoryEntry,
  type WatchHistoryFilters,
  WatchHistoryQuerySchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const watchHistoryRouter = router({
  /** List watch history entries with optional filters and pagination. */
  list: protectedProcedure.input(WatchHistoryQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const filters: WatchHistoryFilters = {
      mediaType: input.mediaType,
      mediaId: input.mediaId,
    };

    const { rows, total } = service.listWatchHistory(filters, limit, offset);

    return {
      data: rows.map(toWatchHistoryEntry),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** List recent watch history with date range filters and enriched media metadata. */
  listRecent: protectedProcedure.input(RecentWatchHistoryQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const filters: RecentWatchHistoryFilters = {
      mediaType: input.mediaType,
      startDate: input.startDate,
      endDate: input.endDate,
    };

    const { rows, total } = service.listRecent(filters, limit, offset);

    return {
      data: rows,
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Get a single watch history entry by ID. */
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    try {
      const row = service.getWatchHistoryEntry(input.id);
      return { data: toWatchHistoryEntry(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Log a watch event. */
  log: protectedProcedure.input(LogWatchSchema).mutation(({ input }) => {
    const { entry, watchlistRemoved } = service.logWatch(input);
    return {
      data: toWatchHistoryEntry(entry),
      watchlistRemoved,
      message: 'Watch logged',
    };
  }),

  /** Get watch progress for a TV show (watched/total per season + overall). */
  progress: protectedProcedure.input(ProgressQuerySchema).query(({ input }) => {
    try {
      return { data: service.getProgress(input.tvShowId) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Get watch progress percentages for multiple TV shows (for library grid). */
  batchProgress: protectedProcedure.input(BatchProgressQuerySchema).query(({ input }) => {
    return { data: service.getBatchProgress(input.tvShowIds) };
  }),

  /** Batch-log watch events for all episodes in a season or show. */
  batchLog: protectedProcedure.input(BatchLogWatchSchema).mutation(({ input }) => {
    const result = service.batchLogWatch(input);
    return {
      data: result,
      message: `Batch logged ${result.logged} episode(s), skipped ${result.skipped}`,
    };
  }),

  /** Delete a watch history entry. */
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    try {
      service.deleteWatchHistoryEntry(input.id);
      return { message: 'Watch history entry deleted' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),
});
