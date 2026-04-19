import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { movies, settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { addMovie as addMovieToLibrary } from '../library/service.js';
import { getImageCache, getTmdbClient } from '../tmdb/index.js';
import { RadarrClient } from './radarr-client.js';
import * as arrService from './service.js';
import { ArrApiError } from './types.js';

const TestConnectionInput = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
});

const MASKED_KEY = '••••••••';

export function resolveApiKey(formKey: string, service: 'radarr' | 'sonarr'): string | null {
  if (formKey !== MASKED_KEY) return formKey;
  const s = arrService.getArrSettings();
  return (service === 'radarr' ? s.radarrApiKey : s.sonarrApiKey) ?? null;
}

export const radarrProcedures = {
  /** Get configuration state for both services. */
  getConfig: protectedProcedure.query(() => {
    return { data: arrService.getArrConfig() };
  }),

  /** Get current Arr settings (URLs and whether API keys are set). */
  getSettings: protectedProcedure.query(() => {
    const s = arrService.getArrSettings();
    return {
      data: {
        radarrUrl: s.radarrUrl ?? '',
        radarrApiKey: s.radarrApiKey ? '••••••••' : '',
        sonarrUrl: s.sonarrUrl ?? '',
        sonarrApiKey: s.sonarrApiKey ? '••••••••' : '',
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
      const config: Parameters<typeof arrService.saveArrSettings>[0] = {};
      if (input.radarrUrl !== undefined) config.radarrUrl = input.radarrUrl;
      if (input.radarrApiKey !== undefined && input.radarrApiKey !== '••••••••')
        config.radarrApiKey = input.radarrApiKey;
      if (input.sonarrUrl !== undefined) config.sonarrUrl = input.sonarrUrl;
      if (input.sonarrApiKey !== undefined && input.sonarrApiKey !== '••••••••')
        config.sonarrApiKey = input.sonarrApiKey;
      arrService.saveArrSettings(config);
      arrService.clearStatusCache();
      return { message: 'Arr settings saved' };
    }),

  /** Test Radarr connection using provided form values. */
  testRadarr: protectedProcedure.input(TestConnectionInput).mutation(async ({ input }) => {
    const apiKey = resolveApiKey(input.apiKey, 'radarr');
    if (!apiKey) {
      return { data: { configured: false, connected: false, error: 'No API key provided' } };
    }
    const client = new RadarrClient(input.url, apiKey);
    try {
      const status = await client.testConnection();
      if (status.appName && status.appName.toLowerCase() !== 'radarr') {
        return {
          data: {
            configured: true,
            connected: false,
            error: `Expected Radarr but connected to ${status.appName} — check the URL`,
          },
        };
      }
      return {
        data: { configured: true, connected: true, ...status },
        message: 'Radarr connection successful',
      };
    } catch (err) {
      const errorMsg =
        err instanceof ArrApiError ? err.message : err instanceof Error ? err.message : String(err);
      return { data: { configured: true, connected: false, error: errorMsg } };
    }
  }),

  /** Test Radarr connection using saved settings (no input required). */
  testRadarrSaved: protectedProcedure.mutation(async () => {
    const s = arrService.getArrSettings();
    if (!s.radarrUrl || !s.radarrApiKey) {
      return {
        data: {
          configured: false,
          connected: false,
          error: 'Radarr URL or API key not configured',
        },
      };
    }
    const client = new RadarrClient(s.radarrUrl, s.radarrApiKey);
    try {
      const status = await client.testConnection();
      if (status.appName && status.appName.toLowerCase() !== 'radarr') {
        return {
          data: {
            configured: true,
            connected: false,
            error: `Expected Radarr but connected to ${status.appName}`,
          },
        };
      }
      return {
        data: { configured: true, connected: true, ...status },
        message: 'Radarr connection successful',
      };
    } catch (err) {
      const errorMsg =
        err instanceof ArrApiError ? err.message : err instanceof Error ? err.message : String(err);
      return { data: { configured: true, connected: false, error: errorMsg } };
    }
  }),

  /** Get Radarr quality profiles. */
  getQualityProfiles: protectedProcedure.query(async () => {
    const client = arrService.getRadarrClient();
    if (!client) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr is not configured' });
    }
    try {
      const profiles = await client.getQualityProfiles();
      return { data: profiles };
    } catch (err) {
      if (err instanceof ArrApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
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
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr is not configured' });
    }
    try {
      const folders = await client.getRootFolders();
      return { data: folders };
    } catch (err) {
      if (err instanceof ArrApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
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
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr is not configured' });
      }
      try {
        const result = await client.checkMovie(input.tmdbId);
        return { data: result };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
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
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr is not configured' });
      }
      try {
        const movie = await client.addMovie(input);
        arrService.clearMovieStatusCache(input.tmdbId);
        return { data: movie };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
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
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr is not configured' });
      }
      try {
        const movie = await client.updateMonitoring(input.radarrId, input.monitored);
        return { data: movie };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
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
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr is not configured' });
      }
      try {
        const result = await client.triggerSearch(input.radarrId);
        return { data: result };
      } catch (err) {
        if (err instanceof ArrApiError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
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
            code: 'INTERNAL_SERVER_ERROR',
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
          code: 'INTERNAL_SERVER_ERROR',
          message: `Arr queue error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  /**
   * Add a movie to Radarr, create a POPS library entry, and set rotation_status = 'protected'.
   */
  downloadAndProtect: protectedProcedure
    .input(
      z.object({
        tmdbId: z.number().int().positive(),
        title: z.string().min(1),
        year: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const client = arrService.getRadarrClient();
      if (!client) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr not configured' });
      }

      const db = getDrizzle();

      const qualityProfileId = db
        .select()
        .from(settings)
        .where(eq(settings.key, 'rotation_quality_profile_id'))
        .get()?.value;
      const rootFolderPath = db
        .select()
        .from(settings)
        .where(eq(settings.key, 'rotation_root_folder_path'))
        .get()?.value;

      if (!qualityProfileId || !rootFolderPath) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Radarr quality profile or root folder not configured',
        });
      }

      const check = await client.checkMovie(input.tmdbId);
      if (!check.exists) {
        await client.addMovie({
          tmdbId: input.tmdbId,
          title: input.title,
          year: input.year,
          qualityProfileId: Number(qualityProfileId),
          rootFolderPath,
        });
      }
      arrService.clearMovieStatusCache(input.tmdbId);

      try {
        const tmdbClient = getTmdbClient();
        const imageCache = getImageCache();
        await addMovieToLibrary(input.tmdbId, tmdbClient, imageCache);
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create library entry: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      const updateResult = db
        .update(movies)
        .set({ rotationStatus: 'protected' })
        .where(eq(movies.tmdbId, input.tmdbId))
        .run();
      if (updateResult.changes === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No library entry found for tmdbId ${input.tmdbId}`,
        });
      }

      return { data: { alreadyInRadarr: check.exists } };
    }),
};
