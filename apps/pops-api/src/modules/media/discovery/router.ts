/**
 * Discovery tRPC router — preference profile, quick pick, trending, and recommendations.
 */
// Side-effect imports — trigger self-registration of all shelf implementations
import './shelf/existing-shelves.js';
import './shelf/local-shelves.js';
import './shelf/tmdb-shelves.js';
import './shelf/credits-shelves.js';
import './shelf/because-you-watched.shelf.js';
import './shelf/genre-shelves.js';
import './shelf/context-shelves.js';

import { movies } from '@pops/db-types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getTmdbClient } from '../tmdb/index.js';
import * as contextPicksService from './context-picks-service.js';
import * as genreSpotlightService from './genre-spotlight-service.js';
import * as plexService from './plex-service.js';
import * as service from './service.js';
import { getRecentImpressions, recordImpressions } from './shelf/impressions.service.js';
import { getRegisteredShelves } from './shelf/registry.js';
import { assembleSession } from './shelf/session.service.js';
import * as tmdbService from './tmdb-service.js';
import { RecommendationsQuerySchema, TrendingQuerySchema } from './types.js';

export const discoveryRouter = router({
  /** Dismiss a movie by tmdbId. Idempotent. */
  dismiss: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .mutation(({ input }) => {
      service.dismiss(input.tmdbId);
      return { success: true };
    }),

  /** Undismiss a movie by tmdbId. */
  undismiss: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .mutation(({ input }) => {
      service.undismiss(input.tmdbId);
      return { success: true };
    }),

  /** Get all dismissed tmdbIds. */
  getDismissed: protectedProcedure.query(() => {
    return { data: service.getDismissed() };
  }),

  /** Get computed preference profile (genre affinities, dimension weights, genre distribution). */
  profile: protectedProcedure.query(() => {
    return { data: service.getPreferenceProfile() };
  }),

  /** Get random unwatched movies for the quick pick flow. */
  quickPick: protectedProcedure
    .input(z.object({ count: z.number().int().positive().max(10).default(3) }))
    .query(({ input }) => {
      return { data: service.getQuickPickMovies(input.count) };
    }),

  /** Get trending movies from TMDB. */
  trending: protectedProcedure.input(TrendingQuerySchema).query(async ({ input }) => {
    try {
      const client = getTmdbClient();
      return await tmdbService.getTrending(client, input.timeWindow, input.page);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error fetching trending',
      });
    }
  }),

  /** Get recommendations based on watchlist movies via TMDB similar. */
  watchlistRecommendations: protectedProcedure.query(async () => {
    try {
      const client = getTmdbClient();
      return await tmdbService.getWatchlistRecommendations(client);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          err instanceof Error ? err.message : 'Unknown error fetching watchlist recommendations',
      });
    }
  }),

  /** Get rewatch suggestions — movies watched 6+ months ago with high scores. */
  rewatchSuggestions: protectedProcedure.query(() => {
    try {
      return { data: service.getRewatchSuggestions() };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error fetching rewatch suggestions',
      });
    }
  }),

  /** Get unwatched library movies scored by preference profile. */
  fromYourServer: protectedProcedure.query(() => {
    const unwatched = service.getUnwatchedLibraryMovies();
    if (unwatched.length === 0) {
      return { results: [] };
    }
    const profile = service.getPreferenceProfile();
    const scored = service.scoreDiscoverResults(unwatched, profile);
    return { results: scored.slice(0, 20) };
  }),

  /** Get trending movies from the Plex Discover API. Returns null data when Plex is not connected. */
  trendingPlex: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(50).default(20) }))
    .query(async ({ input }) => {
      try {
        const results = await plexService.getTrendingFromPlex(input.limit);
        return { data: results };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        // Graceful fallback: return null on Plex API failure (section hidden, not error)
        console.warn('[Discovery] Plex trending failed:', err instanceof Error ? err.message : err);
        return { data: null };
      }
    }),

  /** Get recommendations based on top-rated library movies, scored by preference profile. */
  recommendations: protectedProcedure.input(RecommendationsQuerySchema).query(async ({ input }) => {
    try {
      const profile = service.getPreferenceProfile();
      // Cold start: return empty results when below comparison threshold
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
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error fetching recommendations',
      });
    }
  }),

  /** Get context-aware movie picks based on current time of day, month, and day of week. */
  contextPicks: protectedProcedure
    .input(
      z.object({
        /** Per-collection page numbers for Load More (e.g. { "date-night": 2 }). */
        pages: z.record(z.string(), z.number().int().positive()).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const client = getTmdbClient();
        return await contextPicksService.getContextPicks(client, input.pages);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error fetching context picks',
        });
      }
    }),

  /** Get genre spotlight — top user genres with high-rated TMDB movies. */
  genreSpotlight: protectedProcedure.query(async () => {
    try {
      const client = getTmdbClient();
      const profile = service.getPreferenceProfile();
      const db = getDrizzle();
      const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
      const libraryIds = new Set(rows.map((r) => r.tmdbId));
      return await genreSpotlightService.getGenreSpotlight(client, profile, libraryIds);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error fetching genre spotlight',
      });
    }
  }),

  /**
   * Assemble a discover session: runs the full pipeline (generate → filter → score →
   * select → jitter → record impressions) and returns ordered shelves with the first
   * 10 items each pre-fetched in parallel.
   */
  assembleSession: protectedProcedure.query(async () => {
    try {
      const profile = service.getPreferenceProfile();
      const impressions = getRecentImpressions(7);
      const selectedShelves = assembleSession(profile, impressions);

      // Pre-fetch first page (limit 10) for all selected shelves in parallel
      const shelfResults = await Promise.all(
        selectedShelves.map(async (shelf) => {
          try {
            const items = await shelf.query({ limit: 10, offset: 0 });
            return {
              shelfId: shelf.shelfId,
              title: shelf.title,
              subtitle: shelf.subtitle,
              emoji: shelf.emoji,
              items,
              totalCount: items.length,
              hasMore: items.length >= 10,
            };
          } catch {
            // Individual shelf failure → return empty, don't fail whole response
            return {
              shelfId: shelf.shelfId,
              title: shelf.title,
              subtitle: shelf.subtitle,
              emoji: shelf.emoji,
              items: [],
              totalCount: 0,
              hasMore: false,
            };
          }
        })
      );

      // Filter out shelves with fewer than 3 results (per PRD business rules)
      const nonEmpty = shelfResults.filter((s) => s.items.length >= 3);

      // Record impressions for shelves that returned results
      recordImpressions(nonEmpty.map((s) => s.shelfId));

      return { shelves: nonEmpty };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error assembling discover session',
      });
    }
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
      try {
        const client = getTmdbClient();
        const profile = service.getPreferenceProfile();
        const db = getDrizzle();
        const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
        const libraryIds = new Set(rows.map((r) => r.tmdbId));
        return await genreSpotlightService.getGenreSpotlightPage(
          client,
          profile,
          libraryIds,
          input.genreId,
          input.page
        );
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            err instanceof Error ? err.message : 'Unknown error fetching genre spotlight page',
        });
      }
    }),

  /**
   * Get a page of items for a specific shelf instance.
   *
   * The shelfId uniquely identifies an instance: static shelves use their
   * definition id (e.g. "trending-tmdb"), template shelves append a colon and
   * seed key (e.g. "because-you-watched:42").
   *
   * Returns { items, hasMore, totalCount }. totalCount is null because shelf
   * queries do not expose a separate count method.
   */
  getShelfPage: protectedProcedure
    .input(
      z.object({
        shelfId: z.string().min(1),
        limit: z.number().int().positive().max(50).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const { shelfId, limit, offset } = input;

      // Parse definition ID: the part before the first colon (or the full ID).
      const defId = shelfId.includes(':') ? (shelfId.split(':')[0] ?? shelfId) : shelfId;
      const definitions = getRegisteredShelves();
      const definition = definitions.find((d) => d.id === defId);

      if (!definition) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Unknown shelf: ${defId}`,
        });
      }

      const profile = service.getPreferenceProfile();
      const instances = definition.generate(profile);
      const instance = instances.find((i) => i.shelfId === shelfId);

      if (!instance) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Shelf instance not found: ${shelfId}`,
        });
      }

      try {
        const items = await instance.query({ limit, offset });
        return {
          items,
          hasMore: items.length === limit,
          totalCount: null,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : `Error fetching shelf: ${shelfId}`,
        });
      }
    }),
});
