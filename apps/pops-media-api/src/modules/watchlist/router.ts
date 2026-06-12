/**
 * Watchlist tRPC router — CRUD procedures for the media watchlist.
 *
 * Migrated from `apps/pops-api/src/modules/media/watchlist/router.ts` as
 * part of PRD-167 PR 1 (Theme 13). The media DB handle is injected via the
 * tRPC context rather than reached through `getDrizzle()` so media-api
 * stands alone of pops-api in the dependency graph. Procedure paths stay
 * rooted at `media.watchlist.*` for a transparent dispatcher swap in
 * PRD-167 PR 3.
 *
 * Scope notes:
 *
 *   - List rows are returned without the legacy `title` / `posterUrl`
 *     enrichment because the `movies` / `tv_shows` tables have not yet
 *     been split into `@pops/media-db`. Reads stay on the legacy router
 *     until PRD-165 / PRD-166 land. Per the task spec: "Reads stay on
 *     legacy."
 *   - The Plex push side-effect (push to Plex Discover on add/remove)
 *     is not mirrored here — it stays on the legacy router which still
 *     owns the integration. Per PRD-167: "Plex API integration changes"
 *     are out of scope.
 *
 * Domain errors from `@pops/media-db` (`WatchlistEntryNotFoundError`,
 * `WatchlistReorderConflictError`) are translated to local `HttpError`
 * subclasses inside each handler and routed through `mapDomainErrors`
 * so the tRPC layer sees a proper `TRPCError` with the right wire-level
 * code (e.g. `NOT_FOUND`, `CONFLICT`).
 */
import { z } from 'zod';

import {
  watchlistService,
  WatchlistEntryNotFoundError,
  WatchlistReorderConflictError,
} from '@pops/media-db';

import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../shared/pagination.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';
import {
  AddToWatchlistSchema,
  toWatchlistEntry,
  UpdateWatchlistSchema,
  WatchlistEntrySchema,
  WatchlistQuerySchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const watchlistRouter = router({
  /** List watchlist entries with optional filters and pagination. */
  list: protectedProcedure
    .input(WatchlistQuerySchema)
    .output(z.object({ data: z.array(WatchlistEntrySchema), pagination: PaginationMetaSchema }))
    .query(({ input, ctx }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const { rows, total } = watchlistService.listWatchlist(
        ctx.mediaDb,
        { mediaType: input.mediaType },
        limit,
        offset
      );

      return {
        data: rows.map((row) => toWatchlistEntry({ ...row, title: null, posterUrl: null })),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Check whether a specific media item is on the watchlist. */
  status: protectedProcedure
    .input(
      z.object({
        mediaType: z.enum(['movie', 'tv_show']),
        mediaId: z.number().int().positive(),
      })
    )
    .query(({ input, ctx }) =>
      watchlistService.getWatchlistStatus(ctx.mediaDb, input.mediaType, input.mediaId)
    ),

  /** Get a single watchlist entry by ID. */
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        const row = watchlistService.getWatchlistEntry(ctx.mediaDb, input.id);
        return { data: toWatchlistEntry({ ...row, title: null, posterUrl: null }) };
      } catch (err) {
        if (err instanceof WatchlistEntryNotFoundError) {
          throw new NotFoundError('WatchlistEntry', String(input.id));
        }
        throw err;
      }
    })
  ),

  /** Add an item to the watchlist. Idempotent — returns the existing entry if already present. */
  add: protectedProcedure.input(AddToWatchlistSchema).mutation(({ input, ctx }) => {
    const { row, created } = watchlistService.addToWatchlist(ctx.mediaDb, input);
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
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          const row = watchlistService.updateWatchlistEntry(ctx.mediaDb, input.id, input.data);
          return {
            data: toWatchlistEntry({ ...row, title: null, posterUrl: null }),
            message: 'Watchlist entry updated',
          };
        } catch (err) {
          if (err instanceof WatchlistEntryNotFoundError) {
            throw new NotFoundError('WatchlistEntry', String(input.id));
          }
          throw err;
        }
      })
    ),

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
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          watchlistService.reorderWatchlist(ctx.mediaDb, input.items);
          return { message: 'Watchlist reordered' };
        } catch (err) {
          if (err instanceof WatchlistEntryNotFoundError) {
            throw new NotFoundError('WatchlistEntry', String(err.entryId));
          }
          if (err instanceof WatchlistReorderConflictError) {
            throw new ConflictError(err.message);
          }
          throw err;
        }
      })
    ),

  /** Remove an entry from the watchlist. */
  remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        watchlistService.removeFromWatchlist(ctx.mediaDb, input.id);
        return { message: 'Removed from watchlist' };
      } catch (err) {
        if (err instanceof WatchlistEntryNotFoundError) {
          throw new NotFoundError('WatchlistEntry', String(input.id));
        }
        throw err;
      }
    })
  ),
});
