/**
 * Rotation tRPC router — endpoints for the library rotation system.
 *
 * PRD-070 + PRD-071
 */
import {
  movies,
  rotationCandidates,
  rotationExclusions,
  rotationLog,
  rotationSources,
  settings,
} from '@pops/db-types';
import { TRPCError } from '@trpc/server';
import { asc, count, desc, eq } from 'drizzle-orm';
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

  /** List all configured sources with candidate counts. */
  listSources: protectedProcedure.query(() => {
    const db = getDrizzle();
    const sources = db
      .select({
        id: rotationSources.id,
        type: rotationSources.type,
        name: rotationSources.name,
        priority: rotationSources.priority,
        enabled: rotationSources.enabled,
        config: rotationSources.config,
        lastSyncedAt: rotationSources.lastSyncedAt,
        syncIntervalHours: rotationSources.syncIntervalHours,
        createdAt: rotationSources.createdAt,
        candidateCount: count(rotationCandidates.id),
      })
      .from(rotationSources)
      .leftJoin(rotationCandidates, eq(rotationSources.id, rotationCandidates.sourceId))
      .groupBy(rotationSources.id)
      .orderBy(desc(rotationSources.priority))
      .all();
    return sources;
  }),

  /** Create a new rotation source. */
  createSource: protectedProcedure
    .input(
      z.object({
        type: z.string().min(1),
        name: z.string().min(1),
        priority: z.number().int().min(1).max(10).default(5),
        enabled: z.boolean().default(true),
        config: z.record(z.unknown()).default({}),
        syncIntervalHours: z.number().int().min(1).default(24),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      return db
        .insert(rotationSources)
        .values({
          type: input.type,
          name: input.name,
          priority: input.priority,
          enabled: input.enabled ? 1 : 0,
          config: JSON.stringify(input.config),
          syncIntervalHours: input.syncIntervalHours,
        })
        .returning()
        .get();
    }),

  /** Update an existing rotation source. */
  updateSource: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).optional(),
        priority: z.number().int().min(1).max(10).optional(),
        enabled: z.boolean().optional(),
        config: z.record(z.unknown()).optional(),
        syncIntervalHours: z.number().int().min(1).optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;
      if (input.config !== undefined) updates.config = JSON.stringify(input.config);
      if (input.syncIntervalHours !== undefined)
        updates.syncIntervalHours = input.syncIntervalHours;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' });
      }

      const result = db
        .update(rotationSources)
        .set(updates)
        .where(eq(rotationSources.id, input.id))
        .run();

      return { success: result.changes > 0 };
    }),

  /** Delete a rotation source and its candidates. */
  deleteSource: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      const db = getDrizzle();

      // Check if it's the manual source (cannot delete)
      const source = db
        .select({ type: rotationSources.type })
        .from(rotationSources)
        .where(eq(rotationSources.id, input.id))
        .get();

      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source not found' });
      }
      if (source.type === 'manual') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete the manual source' });
      }

      // Delete candidates first, then the source — in a transaction
      db.transaction(() => {
        db.delete(rotationCandidates).where(eq(rotationCandidates.sourceId, input.id)).run();
        db.delete(rotationSources).where(eq(rotationSources.id, input.id)).run();
      });

      return { success: true };
    }),

  /** List exclusion entries, ordered by most recent first. */
  listExclusions: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        })
        .default({})
    )
    .query(({ input }) => {
      const db = getDrizzle();
      const items = db
        .select()
        .from(rotationExclusions)
        .orderBy(desc(rotationExclusions.excludedAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();
      const total = db
        .select({ count: rotationExclusions.id })
        .from(rotationExclusions)
        .all().length;
      return { items, total };
    }),

  /** Exclude a candidate — add to exclusion list and mark candidate as excluded. */
  excludeCandidate: protectedProcedure
    .input(
      z.object({
        tmdbId: z.number().int().positive(),
        title: z.string().min(1),
        reason: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDrizzle();
      db.insert(rotationExclusions)
        .values({
          tmdbId: input.tmdbId,
          title: input.title,
          reason: input.reason ?? null,
        })
        .onConflictDoNothing()
        .run();

      db.update(rotationCandidates)
        .set({ status: 'excluded' })
        .where(eq(rotationCandidates.tmdbId, input.tmdbId))
        .run();

      return { success: true };
    }),

  /** Remove a movie from the exclusion list. Resets matching candidate to pending. */
  removeExclusion: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .mutation(({ input }) => {
      const db = getDrizzle();
      const result = db
        .delete(rotationExclusions)
        .where(eq(rotationExclusions.tmdbId, input.tmdbId))
        .run();

      if (result.changes > 0) {
        db.update(rotationCandidates)
          .set({ status: 'pending' })
          .where(eq(rotationCandidates.tmdbId, input.tmdbId))
          .run();
      }

      return { success: result.changes > 0 };
    }),
});
