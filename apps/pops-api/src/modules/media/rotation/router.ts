/**
 * Rotation tRPC router — endpoints for the library rotation system.
 *
 * PRD-070 + PRD-071
 */
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { movies } from '@pops/db-types';
import { router, protectedProcedure } from '../../../trpc.js';
import { getDrizzle } from '../../../db.js';
import { cancelLeaving } from './leaving-lifecycle.js';
import {
  startRotationScheduler,
  stopRotationScheduler,
  getRotationSchedulerStatus,
  runRotationCycleNow,
} from './scheduler.js';
import { getRegisteredTypes } from './source-registry.js';
import { syncSource } from './sync-source.js';
import { getPlexToken } from '../plex/service.js';
import { fetchPlexFriends } from '../plex/friends.js';

export const rotationRouter = router({
  /** Cancel leaving status for a specific movie. */
  cancelLeaving: protectedProcedure
    .input(z.object({ movieId: z.number().int().positive() }))
    .mutation(({ input }) => {
      const updated = cancelLeaving(input.movieId);
      return {
        success: updated,
        message: updated ? 'Leaving status cancelled' : 'Movie not found or not leaving',
      };
    }),

  /** Get rotation scheduler status. */
  status: protectedProcedure.query(() => {
    return getRotationSchedulerStatus();
  }),

  /** Toggle the rotation scheduler on/off. */
  toggle: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        cronExpression: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      if (input.enabled) {
        return startRotationScheduler({
          cronExpression: input.cronExpression,
        });
      }
      return stopRotationScheduler();
    }),

  /** Trigger an immediate rotation cycle. */
  runNow: protectedProcedure.mutation(async () => {
    const result = await runRotationCycleNow();
    if (!result) {
      return { success: false, message: 'A rotation cycle is already in progress' };
    }
    return { success: true, result };
  }),

  /** Get movies currently in the 'leaving' state, sorted by expiry. */
  getLeavingMovies: protectedProcedure.query(() => {
    const db = getDrizzle();
    return db
      .select({
        id: movies.id,
        tmdbId: movies.tmdbId,
        title: movies.title,
        posterPath: movies.posterPath,
        rotationExpiresAt: movies.rotationExpiresAt,
        rotationMarkedAt: movies.rotationMarkedAt,
      })
      .from(movies)
      .where(eq(movies.rotationStatus, 'leaving'))
      .orderBy(asc(movies.rotationExpiresAt))
      .all();
  }),

  /** Sync a specific rotation source (fetch candidates from adapter). */
  syncSource: protectedProcedure
    .input(z.object({ sourceId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return syncSource(input.sourceId);
    }),

  /** List registered source adapter types. */
  sourceTypes: protectedProcedure.query(() => {
    return { types: getRegisteredTypes() };
  }),

  /** List available Plex friends (for source config UI picker). */
  listPlexFriends: protectedProcedure.query(async () => {
    const token = getPlexToken();
    if (!token) {
      return { friends: [], error: 'Plex token not configured' };
    }
    try {
      const friends = await fetchPlexFriends(token);
      return { friends, error: null };
    } catch (err) {
      return {
        friends: [],
        error: err instanceof Error ? err.message : 'Failed to fetch Plex friends',
      };
    }
  }),
});
