/**
 * Watchlist tRPC router — CRUD procedures for media watchlist.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import {
  AddToWatchlistSchema,
  UpdateWatchlistSchema,
  WatchlistQuerySchema,
  toWatchlistEntry,
  type WatchlistFilters,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import { getPlexClient } from "../plex/service.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const watchlistRouter = router({
  /** List watchlist entries with optional filters and pagination. */
  list: protectedProcedure.input(WatchlistQuerySchema).query(({ input }) => {
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

  /** Get a single watchlist entry by ID. */
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    try {
      const row = service.getWatchlistEntry(input.id);
      return { data: toWatchlistEntry(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Add an item to the watchlist. Idempotent — returns existing entry if already present. */
  add: protectedProcedure.input(AddToWatchlistSchema).mutation(async ({ input }) => {
    const { row, created } = service.addToWatchlist(input);

    // Best-effort push to Plex — failures do not block local operation
    if (created) {
      const plexRatingKey = (row as Record<string, unknown>).plexRatingKey as string | null;
      if (plexRatingKey) {
        try {
          const client = getPlexClient();
          if (client) {
            await client.addToWatchlist(plexRatingKey);
            console.log(`[Plex] Pushed watchlist add for ratingKey=${plexRatingKey}`);
          }
        } catch (err) {
          console.warn(
            `[Plex] Failed to push watchlist add for ratingKey=${plexRatingKey}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    return {
      data: toWatchlistEntry(row),
      created,
      message: created ? "Added to watchlist" : "Already on watchlist",
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
          data: toWatchlistEntry(row),
          message: "Watchlist entry updated",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
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
        return { message: "Watchlist reordered" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
    }),

  /** Remove an entry from the watchlist. Pushes removal to Plex if connected (best-effort). */
  remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    // Fetch entry before removing to get plexRatingKey
    let plexRatingKey: string | null = null;
    try {
      const entry = service.getWatchlistEntry(input.id);
      plexRatingKey = (entry as Record<string, unknown>).plexRatingKey as string | null;
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }

    try {
      service.removeFromWatchlist(input.id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }

    // Best-effort push removal to Plex
    if (plexRatingKey) {
      try {
        const client = getPlexClient();
        if (client) {
          await client.removeFromWatchlist(plexRatingKey);
          console.log(`[Plex] Pushed watchlist removal for ratingKey=${plexRatingKey}`);
        }
      } catch (err) {
        console.warn(
          `[Plex] Failed to push watchlist removal for ratingKey=${plexRatingKey}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    return { message: "Removed from watchlist" };
  }),
});
