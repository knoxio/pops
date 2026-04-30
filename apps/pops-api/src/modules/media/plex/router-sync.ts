import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { syncJobResults } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getSyncQueue } from '../../../jobs/queues.js';
import { getRedisStatus } from '../../../redis.js';
import { protectedProcedure } from '../../../trpc.js';
import {
  bullmqJobToSyncJob,
  requirePlexClient,
  rowToSyncJob,
  SYNC_JOB_TYPES,
  type SyncJob,
  type SyncJobType,
} from './router-helpers.js';

import type { SyncQueueJobData } from '../../../jobs/types.js';

interface BuildJobDataInput {
  jobType: SyncJobType;
  sectionId?: string | undefined;
  movieSectionId?: string | undefined;
  tvSectionId?: string | undefined;
}

function requireSectionId(sectionId: string | undefined, label: string): string {
  if (!sectionId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `sectionId is required for ${label}` });
  }
  return sectionId;
}

function buildSyncJobData(input: BuildJobDataInput): SyncQueueJobData {
  const { jobType, sectionId, movieSectionId, tvSectionId } = input;
  switch (jobType) {
    case 'plexSyncMovies':
      return { type: 'plexSyncMovies', sectionId: requireSectionId(sectionId, 'movie sync') };
    case 'plexSyncTvShows':
      return { type: 'plexSyncTvShows', sectionId: requireSectionId(sectionId, 'TV sync') };
    case 'plexSyncWatchlist':
      return { type: 'plexSyncWatchlist' };
    case 'plexSyncWatchHistory':
      return { type: 'plexSyncWatchHistory', movieSectionId, tvSectionId };
    case 'plexSyncDiscoverWatches':
      return { type: 'plexSyncDiscoverWatches' };
  }
}

export const syncProcedures = {
  /** Enqueue a background sync job. Returns immediately with the job ID. */
  startSyncJob: protectedProcedure
    .input(
      z.object({
        jobType: z.enum(SYNC_JOB_TYPES),
        sectionId: z.string().min(1).optional(),
        movieSectionId: z.string().min(1).optional(),
        tvSectionId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      requirePlexClient();
      const jobData = buildSyncJobData(input);

      try {
        const queue = getSyncQueue();
        if (!queue) throw new Error('Sync queue unavailable — Redis not configured');
        const [active, waiting] = await Promise.all([
          queue.getJobs(['active']),
          queue.getJobs(['waiting']),
        ]);
        const existing = [...active, ...waiting].find((j) => j.data.type === input.jobType);
        if (existing) {
          return { data: { jobId: existing.id ?? input.jobType } };
        }
        const job = await queue.add(input.jobType, jobData);
        return { data: { jobId: job.id ?? input.jobType } };
      } catch (err) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),

  /** Poll for the status of a sync job (progress, result, error). */
  getSyncJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ input }) => {
      const queue = getSyncQueue();
      const bullJob = queue ? await queue.getJob(input.jobId) : null;
      if (bullJob) return { data: bullmqJobToSyncJob(bullJob) };

      const db = getDrizzle();
      const row = db.select().from(syncJobResults).where(eq(syncJobResults.id, input.jobId)).get();
      if (row) return { data: rowToSyncJob(row) };
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    }),

  /**
   * Get all currently active sync jobs (for restoring UI state on page load).
   *
   * Polled on mount by every consumer of `useSyncJob`. When Redis is down the
   * API runs in degraded mode (per AGENTS.md: "queues and cache disabled");
   * we return an empty list instead of hitting BullMQ — there are no active
   * jobs without a queue, so an empty result is the truthful answer and the
   * page can render without surfacing 500s on every Watchlist visit.
   */
  getActiveSyncJobs: protectedProcedure.query(async () => {
    if (getRedisStatus() === 'disconnected') return { data: [] };
    const queue = getSyncQueue();
    if (!queue) return { data: [] };
    const [active, waiting] = await Promise.all([
      queue.getJobs(['active']),
      queue.getJobs(['waiting']),
    ]);
    const jobs = [...active, ...waiting]
      .filter((j) => SYNC_JOB_TYPES.includes(j.data.type as SyncJobType))
      .map((j) => bullmqJobToSyncJob(j));
    return { data: jobs };
  }),

  /** Get the most recent completed result for each sync type ("last synced" display). */
  getLastSyncResults: protectedProcedure.query(() => {
    const db = getDrizzle();
    const result: Record<string, SyncJob | null> = {};
    for (const jobType of SYNC_JOB_TYPES) {
      const row = db
        .select()
        .from(syncJobResults)
        .where(eq(syncJobResults.jobType, jobType))
        .orderBy(desc(syncJobResults.completedAt))
        .limit(1)
        .get();
      result[jobType] = row ? rowToSyncJob(row) : null;
    }
    return { data: result };
  }),
};
