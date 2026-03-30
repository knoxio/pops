/**
 * Discovery tRPC router — preference profile, quick pick, trending, and recommendations.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { getTmdbClient } from "../tmdb/index.js";
import { TrendingQuerySchema, RecommendationsQuerySchema } from "./types.js";
import * as service from "./service.js";
import * as tmdbService from "./tmdb-service.js";
import * as contextPicksService from "./context-picks-service.js";
import * as genreSpotlightService from "./genre-spotlight-service.js";
import { getDrizzle } from "../../../db.js";
import { movies } from "@pops/db-types";

export const discoveryRouter = router({
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
        code: "INTERNAL_SERVER_ERROR",
        message: err instanceof Error ? err.message : "Unknown error fetching trending",
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
        code: "INTERNAL_SERVER_ERROR",
        message: err instanceof Error ? err.message : "Unknown error fetching rewatch suggestions",
      });
    }
  }),

  /** Get recommendations based on top-rated library movies, scored by preference profile. */
  recommendations: protectedProcedure.input(RecommendationsQuerySchema).query(async ({ input }) => {
    try {
      const client = getTmdbClient();
      const raw = await tmdbService.getRecommendations(client, input.sampleSize);
      const profile = service.getPreferenceProfile();
      const scored = service.scoreDiscoverResults(raw.results, profile);
      return { results: scored, sourceMovies: raw.sourceMovies };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: err instanceof Error ? err.message : "Unknown error fetching recommendations",
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
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Unknown error fetching context picks",
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
        code: "INTERNAL_SERVER_ERROR",
        message: err instanceof Error ? err.message : "Unknown error fetching genre spotlight",
      });
    }
  }),
});
