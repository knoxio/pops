import { asc, count, desc, eq, isNull, sql, sum } from 'drizzle-orm';
import { z } from 'zod';

import { movies, rotationLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure } from '../../../trpc.js';
import { getRadarrClient } from '../arr/service.js';
import { cancelLeaving } from './leaving-lifecycle.js';
import {
  getRotationSchedulerStatus,
  runRotationCycleNow,
  startRotationScheduler,
  stopRotationScheduler,
} from './scheduler.js';

export const rotationSchedulerProcedures = {
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
        return startRotationScheduler({ cronExpression: input.cronExpression });
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

  /** Paginated rotation log entries, newest first. PRD-072 US-06. */
  listRotationLog: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        })
        .default({ limit: 20, offset: 0 })
    )
    .query(({ input }) => {
      const db = getDrizzle();
      const items = db
        .select()
        .from(rotationLog)
        .orderBy(desc(rotationLog.executedAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();
      const countRow = db.select({ total: count() }).from(rotationLog).get();
      return { items, total: countRow?.total ?? 0 };
    }),

  /** Summary statistics for the rotation log page. PRD-072 US-06. */
  getRotationLogStats: protectedProcedure.query(() => {
    const db = getDrizzle();

    const totals = db
      .select({
        totalRemoved: sum(rotationLog.moviesRemoved),
        totalAdded: sum(rotationLog.moviesAdded),
        cycleCount: count(),
      })
      .from(rotationLog)
      .where(isNull(rotationLog.skippedReason))
      .get();

    const totalRotated = (Number(totals?.totalRemoved) || 0) + (Number(totals?.totalAdded) || 0);

    const range = db
      .select({
        minDate: sql<string>`MIN(${rotationLog.executedAt})`,
        maxDate: sql<string>`MAX(${rotationLog.executedAt})`,
      })
      .from(rotationLog)
      .where(isNull(rotationLog.skippedReason))
      .get();

    let avgPerDay = 0;
    if (range?.minDate && range.maxDate) {
      const days = Math.max(
        1,
        (new Date(range.maxDate).getTime() - new Date(range.minDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      avgPerDay = Math.round((totalRotated / days) * 10) / 10;
    }

    const allLogs = db
      .select({ skippedReason: rotationLog.skippedReason })
      .from(rotationLog)
      .orderBy(desc(rotationLog.executedAt))
      .all();

    let streak = 0;
    for (const log of allLogs) {
      if (log.skippedReason) break;
      streak++;
    }

    return { totalRotated, avgPerDay, streak };
  }),
};
