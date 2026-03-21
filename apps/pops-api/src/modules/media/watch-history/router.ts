/**
 * Watch history tRPC router — procedures for tracking watch events.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import {
  LogWatchSchema,
  WatchHistoryQuerySchema,
  ProgressQuerySchema,
  toWatchHistoryEntry,
  type WatchHistoryFilters,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError } from "../../../shared/errors.js";

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

  /** Get a single watch history entry by ID. */
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    try {
      const row = service.getWatchHistoryEntry(input.id);
      return { data: toWatchHistoryEntry(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Log a watch event. */
  log: protectedProcedure.input(LogWatchSchema).mutation(({ input }) => {
    const row = service.logWatch(input);
    return {
      data: toWatchHistoryEntry(row),
      message: "Watch logged",
    };
  }),

  /** Get watch progress for a TV show (watched/total per season + overall). */
  progress: protectedProcedure.input(ProgressQuerySchema).query(({ input }) => {
    try {
      return { data: service.getProgress(input.tvShowId) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Delete a watch history entry. */
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    try {
      service.deleteWatchHistoryEntry(input.id);
      return { message: "Watch history entry deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
