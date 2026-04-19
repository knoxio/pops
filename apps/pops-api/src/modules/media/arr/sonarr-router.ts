import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { resolveApiKey } from './radarr-router.js';
import * as arrService from './service.js';
import { SonarrClient } from './sonarr-client.js';
import { ArrApiError } from './types.js';

function describeArrError(err: unknown): string {
  if (err instanceof ArrApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

const TestConnectionInput = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
});

export const sonarrProcedures = {
  /** Test Sonarr connection using provided form values. */
  testSonarr: protectedProcedure.input(TestConnectionInput).mutation(async ({ input }) => {
    const apiKey = resolveApiKey(input.apiKey, 'sonarr');
    if (!apiKey) {
      return { data: { configured: false, connected: false, error: 'No API key provided' } };
    }
    const client = new SonarrClient(input.url, apiKey);
    try {
      const status = await client.testConnection();
      if (status.appName && status.appName.toLowerCase() !== 'sonarr') {
        return {
          data: {
            configured: true,
            connected: false,
            error: `Expected Sonarr but connected to ${status.appName} — check the URL`,
          },
        };
      }
      return {
        data: { configured: true, connected: true, ...status },
        message: 'Sonarr connection successful',
      };
    } catch (err) {
      const errorMsg = describeArrError(err);
      return { data: { configured: true, connected: false, error: errorMsg } };
    }
  }),

  /** Test Sonarr connection using saved settings (no input required). */
  testSonarrSaved: protectedProcedure.mutation(async () => {
    const s = arrService.getArrSettings();
    if (!s.sonarrUrl || !s.sonarrApiKey) {
      return {
        data: {
          configured: false,
          connected: false,
          error: 'Sonarr URL or API key not configured',
        },
      };
    }
    const client = new SonarrClient(s.sonarrUrl, s.sonarrApiKey);
    try {
      const status = await client.testConnection();
      if (status.appName && status.appName.toLowerCase() !== 'sonarr') {
        return {
          data: {
            configured: true,
            connected: false,
            error: `Expected Sonarr but connected to ${status.appName}`,
          },
        };
      }
      return {
        data: { configured: true, connected: true, ...status },
        message: 'Sonarr connection successful',
      };
    } catch (err) {
      const errorMsg = describeArrError(err);
      return { data: { configured: true, connected: false, error: errorMsg } };
    }
  }),

  /** Get Sonarr quality profiles. */
  getSonarrQualityProfiles: protectedProcedure.query(async () => {
    const client = arrService.getSonarrClient();
    if (!client) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Sonarr is not configured' });
    }
    try {
      const profiles = await client.getQualityProfiles();
      return { data: profiles };
    } catch (err) {
      if (err instanceof ArrApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
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
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Sonarr is not configured' });
    }
    try {
      const folders = await client.getRootFolders();
      return { data: folders };
    } catch (err) {
      if (err instanceof ArrApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
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
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Sonarr is not configured' });
    }
    try {
      const profiles = await client.getLanguageProfiles();
      return { data: profiles };
    } catch (err) {
      if (err instanceof ArrApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
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
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Sonarr is not configured' });
      }
      try {
        const series = await client.addSeries(input);
        return { data: series };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
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
            code: 'INTERNAL_SERVER_ERROR',
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
            code: 'INTERNAL_SERVER_ERROR',
            message: `Sonarr error: ${err.message}`,
          });
        }
        if (err instanceof Error && err.message === 'Sonarr not configured') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
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
            code: 'INTERNAL_SERVER_ERROR',
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
            code: 'INTERNAL_SERVER_ERROR',
            message: `Sonarr error: ${err.message}`,
          });
        }
        if (err instanceof Error && err.message === 'Sonarr not configured') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
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
            code: 'INTERNAL_SERVER_ERROR',
            message: `Sonarr error: ${err.message}`,
          });
        }
        if (err instanceof Error && err.message === 'Sonarr not configured') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
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
            code: 'INTERNAL_SERVER_ERROR',
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
            code: 'INTERNAL_SERVER_ERROR',
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
            code: 'INTERNAL_SERVER_ERROR',
            message: `Sonarr error: ${err.message}`,
          });
        }
        throw err;
      }
    }),
};
