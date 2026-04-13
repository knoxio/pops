/**
 * Rotation tRPC router — endpoints for the library rotation system.
 *
 * PRD-070 + PRD-071
 */
import { movies, rotationLog, settings } from '@pops/db-types';
import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getRadarrClient } from '../arr/service.js';
import { fetchPlexFriends } from '../plex/friends.js';
import { getPlexToken } from '../plex/service.js';
import { cancelLeaving } from './leaving-lifecycle.js';
import {
  getRotationSchedulerStatus,
  runRotationCycleNow,
  startRotationScheduler,
  stopRotationScheduler,
} from './scheduler.js';
import { getRegisteredTypes } from './source-registry.js';
import { syncSource } from './sync-source.js';

/** All rotation setting keys and their defaults. */
const ROTATION_SETTING_KEYS = {
  enabled: { key: 'rotation_enabled', default: '' },
  cronExpression: { key: 'rotation_cron_expression', default: '0 3 * * *' },
  targetFreeGb: { key: 'rotation_target_free_gb', default: '100' },
  leavingDays: { key: 'rotation_leaving_days', default: '7' },
  dailyAdditions: { key: 'rotation_daily_additions', default: '2' },
  avgMovieGb: { key: 'rotation_avg_movie_gb', default: '15' },
  protectedDays: { key: 'rotation_protected_days', default: '30' },
} as const satisfies Record<string, { key: string; default: string }>;

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

  /** Get all rotation settings with defaults. */
  getSettings: protectedProcedure.query(() => {
    const db = getDrizzle();
    const result: Record<string, string> = {};
    for (const [name, def] of Object.entries(ROTATION_SETTING_KEYS)) {
      const record = db.select().from(settings).where(eq(settings.key, def.key)).get();
      result[name] = record?.value ?? def.default;
    }
    return result;
  }),

  /** Save rotation settings. */
  saveSettings: protectedProcedure
    .input(
      z.object({
        cronExpression: z.string().min(1).optional(),
        targetFreeGb: z.number().min(0).optional(),
        leavingDays: z.number().int().min(1).optional(),
        dailyAdditions: z.number().int().min(1).optional(),
        avgMovieGb: z.number().gt(0).optional(),
        protectedDays: z.number().int().min(0).optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      const entries: [string, string][] = [];
      if (input.cronExpression !== undefined)
        entries.push([ROTATION_SETTING_KEYS.cronExpression.key, input.cronExpression]);
      if (input.targetFreeGb !== undefined)
        entries.push([ROTATION_SETTING_KEYS.targetFreeGb.key, String(input.targetFreeGb)]);
      if (input.leavingDays !== undefined)
        entries.push([ROTATION_SETTING_KEYS.leavingDays.key, String(input.leavingDays)]);
      if (input.dailyAdditions !== undefined)
        entries.push([ROTATION_SETTING_KEYS.dailyAdditions.key, String(input.dailyAdditions)]);
      if (input.avgMovieGb !== undefined)
        entries.push([ROTATION_SETTING_KEYS.avgMovieGb.key, String(input.avgMovieGb)]);
      if (input.protectedDays !== undefined)
        entries.push([ROTATION_SETTING_KEYS.protectedDays.key, String(input.protectedDays)]);

      for (const [key, value] of entries) {
        db.insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } })
          .run();
      }

      return { success: true, updated: entries.length };
    }),

  /** Get the last rotation cycle log entry. */
  getLastCycleLog: protectedProcedure.query(() => {
    const db = getDrizzle();
    return db.select().from(rotationLog).orderBy(desc(rotationLog.id)).limit(1).get() ?? null;
  }),

  /** Get Radarr disk space for display. */
  getDiskSpace: protectedProcedure.query(async () => {
    try {
      const client = getRadarrClient();
      if (!client)
        return {
          available: false,
          disks: [] as { path: string; label: string; freeSpace: number; totalSpace: number }[],
        };
      const disks = await client.getDiskSpace();
      return { available: true, disks };
    } catch {
      return {
        available: false,
        disks: [] as { path: string; label: string; freeSpace: number; totalSpace: number }[],
      };
    }
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
