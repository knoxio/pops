/**
 * Library tRPC router — high-level procedures for adding media to the library.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { NotFoundError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { toMovie } from '../movies/types.js';
import { getPlexClient } from '../plex/service.js';
import { checkAndLogMovieWatch } from '../plex/sync-discover-watches.js';
import { getTvdbClient } from '../thetvdb/index.js';
import { refreshTvShow } from '../thetvdb/service.js';
import { TvdbApiError } from '../thetvdb/types.js';
import { getImageCache, getTmdbClient, TmdbApiError } from '../tmdb/index.js';
import { toSeason, toTvShow } from '../tv-shows/types.js';
import * as libraryService from './service.js';
import * as tvShowService from './tv-show-service.js';
import { LibraryListSchema, QuickPickSchema, RefreshMovieSchema } from './types.js';

import type { TmdbClient } from '../tmdb/index.js';

function requireTmdbClient(): TmdbClient {
  return getTmdbClient();
}

export const libraryRouter = router({
  /**
   * List all library items (movies + TV shows) with filtering, sorting, and pagination.
   */
  list: protectedProcedure.input(LibraryListSchema).query(({ input }) => {
    const { items, total } = libraryService.listLibrary(input);
    const totalPages = Math.ceil(total / input.pageSize);
    return {
      data: items,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages,
        hasMore: input.page < totalPages,
      },
    };
  }),

  /** Get all unique genres across the library. */
  genres: protectedProcedure.query(() => {
    return { data: libraryService.listLibraryGenres() };
  }),

  /**
   * Add a movie to the library by TMDB ID.
   * Idempotent — returns existing record if already in library.
   */
  addMovie: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = requireTmdbClient();
      const imageCache = getImageCache();
      try {
        const { movie, created } = await libraryService.addMovie(input.tmdbId, client, imageCache);

        // Best-effort: check Plex Discover cloud for watch status
        if (created) {
          const plexClient = getPlexClient();
          if (plexClient) {
            checkAndLogMovieWatch(plexClient, movie.id, movie.title, movie.tmdbId).catch(() => {
              // Ignore — best-effort
            });
          }
        }

        return {
          data: movie,
          created,
          message: created ? 'Movie added to library' : 'Movie already in library',
        };
      } catch (err) {
        if (err instanceof TmdbApiError) {
          if (err.status === 404) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Movie not found on TMDB (ID: ${input.tmdbId})`,
            });
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `TMDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Refresh movie metadata from TMDB. */
  refreshMovie: protectedProcedure.input(RefreshMovieSchema).mutation(async ({ input }) => {
    const tmdbClient = requireTmdbClient();
    const imageCache = getImageCache();
    try {
      const row = await libraryService.refreshMovie(
        input.id,
        tmdbClient,
        imageCache,
        input.redownloadImages
      );
      return {
        data: toMovie(row),
        message: 'Movie metadata refreshed',
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      if (err instanceof TmdbApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `TMDB API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  /** Add a TV show to the local library by TVDB ID. Idempotent. */
  addTvShow: protectedProcedure
    .input(z.object({ tvdbId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        const client = getTvdbClient();
        const imageCache = getImageCache();
        const result = await tvShowService.addTvShow(input.tvdbId, client, imageCache);
        return {
          data: {
            show: toTvShow(result.show),
            seasons: result.seasons.map(toSeason),
          },
          created: result.created,
          message: result.created ? 'TV show added to library' : 'TV show already in library',
        };
      } catch (err) {
        if (err instanceof TvdbApiError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `TheTVDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /**
   * Quick pick — returns random unwatched movies from the library.
   * Used by the "What should I watch tonight?" flow.
   */
  quickPick: protectedProcedure.input(QuickPickSchema).query(({ input }) => {
    const picks = libraryService.getQuickPicks(input.count);
    return { data: picks };
  }),

  /** Refresh TV show metadata from TheTVDB. */
  refreshTvShow: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        redownloadImages: z.boolean().default(false),
        refreshEpisodes: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const client = getTvdbClient();
        const imageCache = getImageCache();
        const result = await refreshTvShow(client, { ...input, imageCache });
        return {
          data: {
            show: toTvShow(result.show),
            seasons: result.seasons.map(toSeason),
          },
          episodesAdded: result.episodesAdded,
          episodesUpdated: result.episodesUpdated,
          seasonsAdded: result.seasonsAdded,
          seasonsUpdated: result.seasonsUpdated,
          message: 'TV show metadata refreshed',
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        if (err instanceof TvdbApiError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `TheTVDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),
});
