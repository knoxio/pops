/**
 * Media search tRPC router — exposes TMDB movie search and TheTVDB series search.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { getTvdbClient } from '../thetvdb/index.js';
import { TvdbApiError } from '../thetvdb/types.js';
import { getTmdbClient, TmdbApiError } from '../tmdb/index.js';

const SearchMoviesSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.number().int().positive().max(500).optional().default(1),
});

const SearchTvShowsSchema = z.object({
  query: z.string().min(1).max(200),
});

export const searchRouter = router({
  /** Search movies via TMDB. */
  movies: protectedProcedure.input(SearchMoviesSchema).query(async ({ input }) => {
    try {
      const client = getTmdbClient();
      const response = await client.searchMovies(input.query, input.page);
      return {
        results: response.results,
        totalResults: response.totalResults,
        totalPages: response.totalPages,
        page: response.page,
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      const message =
        err instanceof TmdbApiError
          ? `TMDB API error: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error searching movies';
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message,
      });
    }
  }),

  /** Search TV shows via TheTVDB. */
  tvShows: protectedProcedure.input(SearchTvShowsSchema).query(async ({ input }) => {
    try {
      const client = getTvdbClient();
      const results = await client.searchSeries(input.query);
      return { results };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      const message =
        err instanceof TvdbApiError
          ? `TheTVDB API error: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error searching TV shows';
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message,
      });
    }
  }),
});
