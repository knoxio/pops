import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { requireSonarrClient, withArrErrorHandling } from './router-helpers.js';
import * as arrService from './service.js';

export const sonarrProceduresCore = {
  /** Get Sonarr quality profiles. */
  getSonarrQualityProfiles: protectedProcedure.query(async () => {
    const client = requireSonarrClient();
    return withArrErrorHandling('Sonarr', async () => ({
      data: await client.getQualityProfiles(),
    }));
  }),

  /** Get Sonarr root folders. */
  getSonarrRootFolders: protectedProcedure.query(async () => {
    const client = requireSonarrClient();
    return withArrErrorHandling('Sonarr', async () => ({ data: await client.getRootFolders() }));
  }),

  /** Get Sonarr language profiles. */
  getSonarrLanguageProfiles: protectedProcedure.query(async () => {
    const client = requireSonarrClient();
    return withArrErrorHandling('Sonarr', async () => ({
      data: await client.getLanguageProfiles(),
    }));
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
      const client = requireSonarrClient();
      return withArrErrorHandling('Sonarr', async () => ({
        data: await client.addSeries(input),
      }));
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
      return withArrErrorHandling('Sonarr', async () => {
        await arrService.updateSeasonMonitoring(
          input.sonarrId,
          input.seasonNumber,
          input.monitored
        );
        return { message: `Season ${input.seasonNumber} monitoring set to ${input.monitored}` };
      });
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
      return withArrErrorHandling('Sonarr', async () => ({
        data: await arrService.getSeriesEpisodes(input.sonarrId, input.seasonNumber),
      }));
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
      return withArrErrorHandling('Sonarr', async () => {
        await arrService.updateEpisodeMonitoring(input.episodeIds, input.monitored);
        return {
          message: `Updated ${input.episodeIds.length} episode(s) monitoring to ${input.monitored}`,
        };
      });
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
      return withArrErrorHandling('Sonarr', async () => ({
        data: await arrService.updateSeriesMonitoring(input.sonarrId, input.monitored),
      }));
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
      return withArrErrorHandling('Sonarr', async () => ({
        data: await arrService.triggerSeriesSearch(input.sonarrId, input.seasonNumber),
      }));
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
      return withArrErrorHandling('Sonarr calendar', async () => ({
        data: await arrService.getSonarrCalendar(input.start, input.end),
      }));
    }),

  /** Get Sonarr status for a TV show by TVDB ID. */
  getShowStatus: protectedProcedure
    .input(z.object({ tvdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return withArrErrorHandling('Sonarr', async () => ({
        data: await arrService.getShowStatus(input.tvdbId),
      }));
    }),

  /** Check if a series exists in Sonarr by TVDB ID. */
  checkSeries: protectedProcedure
    .input(z.object({ tvdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return withArrErrorHandling('Sonarr', async () => ({
        data: await arrService.checkSeries(input.tvdbId),
      }));
    }),
};
