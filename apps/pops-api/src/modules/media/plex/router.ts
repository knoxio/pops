/**
 * Plex tRPC router — sync operations and connection management.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { PlexApiError } from "./types.js";
import type { PlexClient } from "./client.js";
import * as plexService from "./service.js";
import * as scheduler from "./scheduler.js";

function requirePlexClient(): PlexClient {
  const client = plexService.getPlexClient();
  if (!client) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Plex is not configured. Set PLEX_URL and PLEX_TOKEN environment variables.",
    });
  }
  return client;
}

export const plexRouter = router({
  /** Test connection to Plex Media Server. */
  testConnection: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const connected = await plexService.testConnection(client);
      return { data: { connected } };
    } catch (err) {
      if (err instanceof PlexApiError) {
        return { data: { connected: false, error: err.message } };
      }
      throw err;
    }
  }),

  /** List Plex library sections. */
  getLibraries: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const libraries = await client.getLibraries();
      return { data: libraries };
    } catch (err) {
      if (err instanceof PlexApiError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Plex API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  /** Sync movies from a Plex library section. */
  syncMovies: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const client = requirePlexClient();
      try {
        const result = await plexService.syncMovies(client, input.sectionId);
        return {
          data: result,
          message: `Synced ${result.synced} movies (${result.skipped} skipped, ${result.errors.length} errors)`,
        };
      } catch (err) {
        if (err instanceof PlexApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Plex API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Sync TV shows from a Plex library section. */
  syncTvShows: protectedProcedure
    .input(z.object({ sectionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const client = requirePlexClient();
      try {
        const result = await plexService.syncTvShows(client, input.sectionId);
        return {
          data: result,
          message: `Synced ${result.synced} TV shows (${result.skipped} skipped, ${result.errors.length} errors)`,
        };
      } catch (err) {
        if (err instanceof PlexApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Plex API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Get current sync status. */
  getSyncStatus: protectedProcedure.query(() => {
    const client = plexService.getPlexClient();
    return { data: plexService.getSyncStatus(client) };
  }),

  /** Start the periodic sync scheduler. */
  startScheduler: protectedProcedure
    .input(
      z
        .object({
          intervalMs: z.number().int().positive().optional(),
          movieSectionId: z.string().min(1).optional(),
          tvSectionId: z.string().min(1).optional(),
        })
        .optional()
    )
    .mutation(({ input }) => {
      const status = scheduler.startScheduler(input ?? {});
      return { data: status };
    }),

  /** Stop the periodic sync scheduler. */
  stopScheduler: protectedProcedure.mutation(() => {
    const status = scheduler.stopScheduler();
    return { data: status };
  }),

  /** Get scheduler status. */
  getSchedulerStatus: protectedProcedure.query(() => {
    return { data: scheduler.getSchedulerStatus() };
  }),
});
