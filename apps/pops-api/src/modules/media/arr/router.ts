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

  /** Get current Arr settings (URLs and whether API keys are set). */
  getSettings: protectedProcedure.query(() => {
    const s = arrService.getArrSettings();
    return {
      data: {
        radarrUrl: s.radarrUrl ?? "",
        radarrApiKey: s.radarrApiKey ? "••••••••" : "",
        sonarrUrl: s.sonarrUrl ?? "",
        sonarrApiKey: s.sonarrApiKey ? "••••••••" : "",
        radarrHasKey: !!s.radarrApiKey,
        sonarrHasKey: !!s.sonarrApiKey,
      },
    };
  }),

  /** Save Arr settings (URLs and API keys). */
  saveSettings: protectedProcedure
    .input(
      z.object({
        radarrUrl: z.string().optional(),
        radarrApiKey: z.string().optional(),
        sonarrUrl: z.string().optional(),
        sonarrApiKey: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      // Don't overwrite API keys with the masked placeholder
      const config: Parameters<typeof arrService.saveArrSettings>[0] = {};
      if (input.radarrUrl !== undefined) config.radarrUrl = input.radarrUrl;
      if (input.radarrApiKey !== undefined && input.radarrApiKey !== "••••••••")
        config.radarrApiKey = input.radarrApiKey;
      if (input.sonarrUrl !== undefined) config.sonarrUrl = input.sonarrUrl;
      if (input.sonarrApiKey !== undefined && input.sonarrApiKey !== "••••••••")
        config.sonarrApiKey = input.sonarrApiKey;
      arrService.saveArrSettings(config);
      arrService.clearStatusCache();
      return { message: "Arr settings saved" };
    }),

  /** Get Radarr quality profiles. */
  getQualityProfiles: protectedProcedure.query(async () => {
    const client = arrService.getRadarrClient();
    if (!client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Radarr is not configured" });
    }
    try {
      const profiles = await client.getQualityProfiles();
      return { data: profiles };
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

  /** Get Radarr root folders. */
  getRootFolders: protectedProcedure.query(async () => {
    const client = arrService.getRadarrClient();
    if (!client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Radarr is not configured" });
    }
    try {
      const folders = await client.getRootFolders();
      return { data: folders };
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

  /** Check if a movie exists in Radarr by TMDB ID. */
  checkMovie: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const client = arrService.getRadarrClient();
      if (!client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Radarr is not configured" });
      }
      try {
        const result = await client.checkMovie(input.tmdbId);
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

  /** Add a movie to Radarr. */
  addMovie: protectedProcedure
    .input(
      z.object({
        tmdbId: z.number().int().positive(),
        title: z.string().min(1),
        year: z.number().int().positive(),
        qualityProfileId: z.number().int().positive(),
        rootFolderPath: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const client = arrService.getRadarrClient();
      if (!client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Radarr is not configured" });
      }
      try {
        const movie = await client.addMovie(input);
        return { data: movie };
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

  /** Update monitoring flag for a movie in Radarr. */
  updateMonitoring: protectedProcedure
    .input(
      z.object({
        radarrId: z.number().int().positive(),
        monitored: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const client = arrService.getRadarrClient();
      if (!client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Radarr is not configured" });
      }
      try {
        const movie = await client.updateMonitoring(input.radarrId, input.monitored);
        return { data: movie };
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

  /** Trigger a search for a movie in Radarr. */
  triggerSearch: protectedProcedure
    .input(z.object({ radarrId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = arrService.getRadarrClient();
      if (!client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Radarr is not configured" });
      }
      try {
        const result = await client.triggerSearch(input.radarrId);
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

  /** Get upcoming episodes from Sonarr calendar. */
  getCalendar: protectedProcedure
    .input(
      z.object({
        start: z.string().date(),
        end: z.string().date(),
      })
    )
    .query(async ({ input }) => {
      try {
        const episodes = await arrService.getSonarrCalendar(input.start, input.end);
        return { data: episodes };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Sonarr calendar error: ${err.message}`,
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

  /** Check if a series exists in Sonarr by TVDB ID. */
  checkSeries: protectedProcedure
    .input(z.object({ tvdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const result = await arrService.checkSeries(input.tvdbId);
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

  /** Get Sonarr quality profiles. */
  getSonarrQualityProfiles: protectedProcedure.query(async () => {
    const client = arrService.getSonarrClient();
    if (!client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sonarr is not configured" });
    }
    try {
      const profiles = await client.getQualityProfiles();
      return { data: profiles };
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

  /** Get Sonarr root folders. */
  getSonarrRootFolders: protectedProcedure.query(async () => {
    const client = arrService.getSonarrClient();
    if (!client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sonarr is not configured" });
    }
    try {
      const folders = await client.getRootFolders();
      return { data: folders };
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

  /** Get Sonarr language profiles. */
  getSonarrLanguageProfiles: protectedProcedure.query(async () => {
    const client = arrService.getSonarrClient();
    if (!client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sonarr is not configured" });
    }
    try {
      const profiles = await client.getLanguageProfiles();
      return { data: profiles };
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

  /** Add a series to Sonarr. */
  addSeries: protectedProcedure
    .input(
      z.object({
        tvdbId: z.number().int().positive(),
        title: z.string().min(1),
        qualityProfileId: z.number().int().positive(),
        rootFolderPath: z.string().min(1),
        languageProfileId: z.number().int().positive(),
        seasons: z.array(
          z.object({
            seasonNumber: z.number().int().min(0),
            monitored: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const client = arrService.getSonarrClient();
      if (!client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sonarr is not configured" });
      }
      try {
        const series = await client.addSeries(input);
        return { data: series };
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

  /** Update season monitoring for a series in Sonarr. */
  updateSeasonMonitoring: protectedProcedure
    .input(
      z.object({
        sonarrId: z.number().int().positive(),
        seasonNumber: z.number().int().min(0),
        monitored: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await arrService.updateSeasonMonitoring(
          input.sonarrId,
          input.seasonNumber,
          input.monitored
        );
        return { message: `Season ${input.seasonNumber} monitoring set to ${input.monitored}` };
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

  /** Get episodes for a series from Sonarr, optionally filtered by season. */
  getSeriesEpisodes: protectedProcedure
    .input(
      z.object({
        sonarrId: z.number().int().positive(),
        seasonNumber: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const episodes = await arrService.getSeriesEpisodes(input.sonarrId, input.seasonNumber);
        return { data: episodes };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Sonarr error: ${err.message}`,
          });
        }
        if (err instanceof Error && err.message === "Sonarr not configured") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
        }
        throw err;
      }
    }),

  /** Batch update episode monitoring in Sonarr. */
  updateEpisodeMonitoring: protectedProcedure
    .input(
      z.object({
        episodeIds: z.array(z.number().int().positive()).min(1),
        monitored: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await arrService.updateEpisodeMonitoring(input.episodeIds, input.monitored);
        return {
          message: `Updated ${input.episodeIds.length} episode(s) monitoring to ${input.monitored}`,
        };
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

  /** Update monitoring flag for a series in Sonarr. */
  updateSeriesMonitoring: protectedProcedure
    .input(
      z.object({
        sonarrId: z.number().int().positive(),
        monitored: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const series = await arrService.updateSeriesMonitoring(input.sonarrId, input.monitored);
        return { data: series };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Sonarr error: ${err.message}`,
          });
        }
        if (err instanceof Error && err.message === "Sonarr not configured") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
        }
        throw err;
      }
    }),

  /** Trigger a search for a series or season in Sonarr. */
  triggerSeriesSearch: protectedProcedure
    .input(
      z.object({
        sonarrId: z.number().int().positive(),
        seasonNumber: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await arrService.triggerSeriesSearch(input.sonarrId, input.seasonNumber);
        return { data: result };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Sonarr error: ${err.message}`,
          });
        }
        if (err instanceof Error && err.message === "Sonarr not configured") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
        }
        throw err;
      }
    }),
});
