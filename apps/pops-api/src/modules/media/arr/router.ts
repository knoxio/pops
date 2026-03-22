/**
 * Arr tRPC router — Radarr/Sonarr integration endpoints.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { ArrApiError } from "./types.js";
import * as arrService from "./service.js";

export const arrRouter = router({
  /** Test Radarr connection and return server version. Safe to call when not configured. */
  testRadarr: protectedProcedure.query(async () => {
    const client = arrService.getRadarrClient();
    if (!client) {
      return { data: { configured: false, connected: false } };
    }

    try {
      const status = await client.testConnection();
      return {
        data: { configured: true, connected: true, ...status },
        message: "Radarr connection successful",
      };
    } catch (err) {
      const errorMsg =
        err instanceof ArrApiError ? err.message : err instanceof Error ? err.message : String(err);
      return { data: { configured: true, connected: false, error: errorMsg } };
    }
  }),

  /** Test Sonarr connection and return server version. Safe to call when not configured. */
  testSonarr: protectedProcedure.query(async () => {
    const client = arrService.getSonarrClient();
    if (!client) {
      return { data: { configured: false, connected: false } };
    }

    try {
      const status = await client.testConnection();
      return {
        data: { configured: true, connected: true, ...status },
        message: "Sonarr connection successful",
      };
    } catch (err) {
      const errorMsg =
        err instanceof ArrApiError ? err.message : err instanceof Error ? err.message : String(err);
      return { data: { configured: true, connected: false, error: errorMsg } };
    }
  }),

  /** Get configuration state for both services. */
  getConfig: protectedProcedure.query(() => {
    return { data: arrService.getArrConfig() };
  }),

  /** Get Radarr status for a movie by TMDB ID. */
  getMovieStatus: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const result = await arrService.getMovieStatus(input.tmdbId);
        return { data: result };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Radarr error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Get combined download queue from Radarr + Sonarr. */
  getDownloadQueue: protectedProcedure.query(async () => {
    try {
      const items = await arrService.getDownloadQueue();
      return { data: items };
    } catch (err) {
      if (err instanceof ArrApiError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Arr queue error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  /** Get Sonarr status for a TV show by TVDB ID. */
  getShowStatus: protectedProcedure
    .input(z.object({ tvdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const result = await arrService.getShowStatus(input.tvdbId);
        return { data: result };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Sonarr error: ${err.message}`,
          });
        }
        throw err;
      }
    }),
});
