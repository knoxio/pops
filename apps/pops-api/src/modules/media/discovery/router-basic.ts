import { z } from 'zod';

import { protectedProcedure } from '../../../trpc.js';
import { withTrpcInternalError } from './router-helpers.js';
import * as service from './service.js';

export const basicProcedures = {
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

  /** Get rewatch suggestions — movies watched 6+ months ago with high scores. */
  rewatchSuggestions: protectedProcedure.query(() => {
    return withTrpcInternalError('Unknown error fetching rewatch suggestions', async () =>
      Promise.resolve({ data: service.getRewatchSuggestions() })
    );
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
};
