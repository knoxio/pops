import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { requireRadarrClient, withArrErrorHandling } from './router-helpers.js';
import * as arrService from './service.js';

export const radarrProceduresCore = {
  /** Get Radarr quality profiles. */
  getQualityProfiles: protectedProcedure.query(async () => {
    const client = requireRadarrClient();
    return withArrErrorHandling('Radarr', async () => ({
      data: await client.getQualityProfiles(),
    }));
  }),

  /** Get Radarr root folders. */
  getRootFolders: protectedProcedure.query(async () => {
    const client = requireRadarrClient();
    return withArrErrorHandling('Radarr', async () => ({ data: await client.getRootFolders() }));
  }),

  /** Check if a movie exists in Radarr by TMDB ID. */
  checkMovie: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const client = requireRadarrClient();
      return withArrErrorHandling('Radarr', async () => ({
        data: await client.checkMovie(input.tmdbId),
      }));
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
      const client = requireRadarrClient();
      return withArrErrorHandling('Radarr', async () => {
        const movie = await client.addMovie(input);
        arrService.clearMovieStatusCache(input.tmdbId);
        return { data: movie };
      });
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
      const client = requireRadarrClient();
      return withArrErrorHandling('Radarr', async () => ({
        data: await client.updateMonitoring(input.radarrId, input.monitored),
      }));
    }),

  /** Trigger a search for a movie in Radarr. */
  triggerSearch: protectedProcedure
    .input(z.object({ radarrId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = requireRadarrClient();
      return withArrErrorHandling('Radarr', async () => ({
        data: await client.triggerSearch(input.radarrId),
      }));
    }),

  /** Get Radarr status for a movie by TMDB ID. */
  getMovieStatus: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return withArrErrorHandling('Radarr', async () => ({
        data: await arrService.getMovieStatus(input.tmdbId),
      }));
    }),

  /** Get combined download queue from Radarr + Sonarr. */
  getDownloadQueue: protectedProcedure.query(async () => {
    return withArrErrorHandling('Arr queue', async () => ({
      data: await arrService.getDownloadQueue(),
    }));
  }),
};
