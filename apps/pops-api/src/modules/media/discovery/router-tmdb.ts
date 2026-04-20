import { z } from 'zod';

import { movies } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { getTmdbClient } from '../tmdb/index.js';
import * as contextPicksService from './context-picks-service.js';
import * as genreSpotlightService from './genre-spotlight-service.js';
import * as plexService from './plex-service.js';
import { withTrpcInternalError } from './router-helpers.js';
import * as service from './service.js';
import * as tmdbService from './tmdb-service.js';
import { RecommendationsQuerySchema, TrendingQuerySchema } from './types.js';

function getLibraryTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  return new Set(rows.map((r) => r.tmdbId));
}

export const tmdbAndContextProcedures = {
  /** Get trending movies from TMDB. */
  trending: protectedProcedure.input(TrendingQuerySchema).query(async ({ input }) => {
    return withTrpcInternalError('Unknown error fetching trending', async () => {
      const client = getTmdbClient();
      return tmdbService.getTrending(client, input.timeWindow, input.page);
    });
  }),

  /** Get recommendations based on watchlist movies via TMDB similar. */
  watchlistRecommendations: protectedProcedure.query(async () => {
    return withTrpcInternalError('Unknown error fetching watchlist recommendations', async () => {
      const client = getTmdbClient();
      return tmdbService.getWatchlistRecommendations(client);
    });
  }),

  /** Get trending movies from the Plex Discover API. Returns null data when Plex is not connected. */
  trendingPlex: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(50).default(20) }))
    .query(async ({ input }) => {
      try {
        const results = await plexService.getTrendingFromPlex(input.limit);
        return { data: results };
      } catch (err) {
        console.warn('[Discovery] Plex trending failed:', err instanceof Error ? err.message : err);
        return { data: null };
      }
    }),

  /** Get recommendations based on top-rated library movies, scored by preference profile. */
  recommendations: protectedProcedure.input(RecommendationsQuerySchema).query(async ({ input }) => {
    return withTrpcInternalError('Unknown error fetching recommendations', async () => {
      const profile = service.getPreferenceProfile();
      if (profile.totalComparisons < 5) {
        return {
          results: [],
          sourceMovies: [],
          totalComparisons: profile.totalComparisons,
        };
      }
      const client = getTmdbClient();
      const raw = await tmdbService.getRecommendations(client, input.sampleSize);
      const scored = service.scoreDiscoverResults(raw.results, profile);
      return {
        results: scored,
        sourceMovies: raw.sourceMovies,
        totalComparisons: profile.totalComparisons,
      };
    });
  }),

  /** Get context-aware movie picks based on current time of day, month, and day of week. */
  contextPicks: protectedProcedure
    .input(
      z.object({
        pages: z.record(z.string(), z.number().int().positive()).optional(),
      })
    )
    .query(async ({ input }) => {
      return withTrpcInternalError('Unknown error fetching context picks', async () => {
        const client = getTmdbClient();
        return contextPicksService.getContextPicks(client, input.pages);
      });
    }),

  /** Get genre spotlight — top user genres with high-rated TMDB movies. */
  genreSpotlight: protectedProcedure.query(async () => {
    return withTrpcInternalError('Unknown error fetching genre spotlight', async () => {
      const client = getTmdbClient();
      const profile = service.getPreferenceProfile();
      return genreSpotlightService.getGenreSpotlight(client, profile, getLibraryTmdbIds());
    });
  }),

  /** Load more results for a specific genre spotlight row. */
  genreSpotlightPage: protectedProcedure
    .input(
      z.object({
        genreId: z.number().int().positive(),
        page: z.number().int().positive().min(2),
      })
    )
    .query(async ({ input }) => {
      return withTrpcInternalError('Unknown error fetching genre spotlight page', async () => {
        const client = getTmdbClient();
        const profile = service.getPreferenceProfile();
        return genreSpotlightService.getGenreSpotlightPage({
          client,
          profile,
          libraryIds: getLibraryTmdbIds(),
          genreId: input.genreId,
          page: input.page,
        });
      });
    }),
};
