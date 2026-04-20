import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { syncJobResults } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getSyncQueue } from '../../../jobs/queues.js';
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
      const bullJob = await queue.getJob(input.jobId);
      if (bullJob) return { data: bullmqJobToSyncJob(bullJob) };

      const db = getDrizzle();
      const row = db.select().from(syncJobResults).where(eq(syncJobResults.id, input.jobId)).get();
      if (row) return { data: rowToSyncJob(row) };
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    }),

  /** Get all currently active sync jobs (for restoring UI state on page load). */
  getActiveSyncJobs: protectedProcedure.query(async () => {
    const queue = getSyncQueue();
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
