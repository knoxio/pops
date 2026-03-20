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

  /** Add an item to the watchlist. */
  add: protectedProcedure.input(AddToWatchlistSchema).mutation(({ input }) => {
    try {
      const row = service.addToWatchlist(input);
      return {
        data: toWatchlistEntry(row),
        message: "Added to watchlist",
      };
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }
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

  /** Remove an entry from the watchlist. */
  remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    try {
      service.removeFromWatchlist(input.id);
      return { message: "Removed from watchlist" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
