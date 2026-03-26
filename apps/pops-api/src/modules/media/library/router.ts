/**
 * Library tRPC router — high-level procedures for adding media to the library.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { getTmdbClient, TmdbClient, TmdbApiError } from "../tmdb/index.js";
import { NotFoundError } from "../../../shared/errors.js";
import { toMovie } from "../movies/types.js";
import { toTvShow, toSeason } from "../tv-shows/types.js";
import { RefreshMovieSchema, QuickPickSchema, LibraryListSchema } from "./types.js";
import * as libraryService from "./service.js";
import { getTvdbClient } from "../thetvdb/index.js";
import { TvdbApiError } from "../thetvdb/types.js";
import { refreshTvShow } from "../thetvdb/service.js";
import * as tvShowService from "./tv-show-service.js";

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
      try {
        const { movie, created } = await libraryService.addMovie(input.tmdbId, client);
        return {
          data: movie,
          created,
          message: created ? "Movie added to library" : "Movie already in library",
        };
      } catch (err) {
        if (err instanceof TmdbApiError) {
          if (err.status === 404) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Movie not found on TMDB (ID: ${input.tmdbId})`,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `TMDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Refresh movie metadata from TMDB. */
  refreshMovie: protectedProcedure.input(RefreshMovieSchema).mutation(async ({ input }) => {
    const tmdbClient = requireTmdbClient();
    try {
      const row = await libraryService.refreshMovie(input.id, tmdbClient);
      return {
        data: toMovie(row),
        message: "Movie metadata refreshed",
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      if (err instanceof TmdbApiError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
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
        if (!client) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "THETVDB_API_KEY environment variable is not set",
          });
        }
        const result = await tvShowService.addTvShow(input.tvdbId, client);
        return {
          data: {
            show: toTvShow(result.show),
            seasons: result.seasons.map(toSeason),
          },
          created: result.created,
          message: result.created ? "TV show added to library" : "TV show already in library",
        };
      } catch (err) {
        if (err instanceof TvdbApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
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
      const client = getTvdbClient();
      if (!client) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "THETVDB_API_KEY environment variable is not set",
        });
      }

      try {
        const result = await refreshTvShow(client, input);
        return {
          data: {
            show: toTvShow(result.show),
            seasons: result.seasons.map(toSeason),
          },
          episodesAdded: result.episodesAdded,
          episodesUpdated: result.episodesUpdated,
          seasonsAdded: result.seasonsAdded,
          seasonsUpdated: result.seasonsUpdated,
          message: "TV show metadata refreshed",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof TvdbApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `TheTVDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),
});
