/**
 * Watchlist tRPC router — CRUD procedures for media watchlist.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getPlexClient } from '../plex/service.js';
import { clearLeavingOnWatchlistAdd } from '../rotation/leaving-lifecycle.js';
import { pushToPlexWatchlist } from './plex-push.js';
import * as service from './service.js';
import {
  AddToWatchlistSchema,
  toWatchlistEntry,
  UpdateWatchlistSchema,
  type WatchlistFilters,
  WatchlistEntrySchema,
  WatchlistQuerySchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const watchlistRouter = router({
  /** List watchlist entries with optional filters and pagination. */
  list: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/media/watchlist',
        summary: 'List watchlist',
        tags: ['watchlist'],
      },
    })
    .input(WatchlistQuerySchema)
    .output(z.object({ data: z.array(WatchlistEntrySchema), pagination: PaginationMetaSchema }))
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const filters: WatchlistFilters = {
        mediaType: input.mediaType,
      };

      const { rows, total } = service.listWatchlist(filters, limit, offset);

      return {
        data: rows.map(toWatchlistEntry),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Check if a specific media item is on the watchlist. */
  status: protectedProcedure
    .input(
      z.object({
        mediaType: z.enum(['movie', 'tv_show']),
        mediaId: z.number().int().positive(),
      })
    )
    .query(({ input }) => {
      return service.getWatchlistStatus(input.mediaType, input.mediaId);
    }),

  /** Get a single watchlist entry by ID. */
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    try {
      const row = service.getWatchlistEntry(input.id);
      return { data: toWatchlistEntry({ ...row, title: null, posterUrl: null }) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  /** Add an item to the watchlist. Idempotent — returns existing entry if already present. */
  add: protectedProcedure.input(AddToWatchlistSchema).mutation(async ({ input }) => {
    const { row, created } = service.addToWatchlist(input);

    // Clear leaving rotation status if the movie was in the leaving state
    if (created) {
      clearLeavingOnWatchlistAdd(input.mediaType, input.mediaId);
    }

    // Best-effort push to Plex — failures do not block local operation
    if (created) {
      const plexRatingKey = (row as Record<string, unknown>).plexRatingKey as string | null;
      if (plexRatingKey) {
        try {
          const client = getPlexClient();
          if (client) {
            await client.addToWatchlist(plexRatingKey);
            console.warn(`[Plex] Pushed watchlist add for ratingKey=${plexRatingKey}`);
          }
        } catch (err) {
          console.warn(
            `[Plex] Failed to push watchlist add for ratingKey=${plexRatingKey}:`,
            err instanceof Error ? err.message : err
          );
        }
      } else {
        // Manually added items lack a plexRatingKey — look one up via Discover API
        await pushToPlexWatchlist(row.id, input.mediaType, input.mediaId);
      }
    }

    return {
      data: toWatchlistEntry({ ...row, title: null, posterUrl: null }),
      created,
      message: created ? 'Added to watchlist' : 'Already on watchlist',
    };
  }),

  /** Update a watchlist entry. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: UpdateWatchlistSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateWatchlistEntry(input.id, input.data);
        return {
          data: toWatchlistEntry({ ...row, title: null, posterUrl: null }),
          message: 'Watchlist entry updated',
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** Batch-reorder watchlist items by setting new priorities. */
  reorder: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.number(),
            priority: z.number().int().min(0),
          })
        ),
      })
    )
    .mutation(({ input }) => {
      try {
        service.reorderWatchlist(input.items);
        return { message: 'Watchlist reordered' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: err.message });
        }
        throw err;
      }
    }),

  /** Remove an entry from the watchlist. Pushes removal to Plex if connected (best-effort). */
  remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    // Fetch entry before removing to get plexRatingKey
    let plexRatingKey: string | null;
    try {
      const entry = service.getWatchlistEntry(input.id);
      plexRatingKey = (entry as Record<string, unknown>).plexRatingKey as string | null;
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }

    try {
      service.removeFromWatchlist(input.id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }

    // Best-effort push removal to Plex
    if (plexRatingKey) {
      try {
        const client = getPlexClient();
        if (client) {
          await client.removeFromWatchlist(plexRatingKey);
          console.warn(`[Plex] Pushed watchlist removal for ratingKey=${plexRatingKey}`);
        }
      } catch (err) {
        console.warn(
          `[Plex] Failed to push watchlist removal for ratingKey=${plexRatingKey}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    return { message: 'Removed from watchlist' };
  }),
});
