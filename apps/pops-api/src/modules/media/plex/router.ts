import { TRPCError } from '@trpc/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Plex tRPC router — sync operations and connection management.
 *
 * Sync jobs are enqueued into the pops:sync BullMQ queue (PRD-074).
 * The frontend polls getSyncJobStatus for progress and results.
 * Completed results are persisted to sync_job_results by the worker.
 */
import { settings, syncJobResults } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getSyncQueue } from '../../../jobs/queues.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
import { PlexClient } from './client.js';
import * as scheduler from './scheduler.js';
import * as plexService from './service.js';
import { PlexApiError } from './types.js';

import type { Job } from 'bullmq';

import type { SyncQueueJobData } from '../../../jobs/types.js';

// ---------------------------------------------------------------------------
// Sync job types
// ---------------------------------------------------------------------------

export const SYNC_JOB_TYPES = [
  'plexSyncMovies',
  'plexSyncTvShows',
  'plexSyncWatchlist',
  'plexSyncWatchHistory',
  'plexSyncDiscoverWatches',
] as const;

export type SyncJobType = (typeof SYNC_JOB_TYPES)[number];

export interface SyncJobProgress {
  processed: number;
  total: number;
}

export interface SyncJob {
  id: string;
  jobType: SyncJobType;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  progress: SyncJobProgress;
  result: unknown;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requirePlexClient(): PlexClient {
  const client = plexService.getPlexClient();
  if (!client) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Plex is not configured. Connect to Plex in settings first.',
    });
  }
  return client;
}

function bullmqJobToSyncJob(job: Job<SyncQueueJobData>): SyncJob {
  const state =
    job.finishedOn != null && !job.failedReason
      ? 'completed'
      : job.failedReason
        ? 'failed'
        : 'running';
  const progress = (job.progress ?? {
    processed: 0,
    total: 0,
  }) as SyncJobProgress;
  return {
    id: job.id ?? '',
    jobType: job.data.type as SyncJobType,
    status: state,
    startedAt: job.processedOn
      ? new Date(job.processedOn).toISOString()
      : new Date(job.timestamp).toISOString(),
    completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    durationMs: job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : null,
    progress,
    result: job.returnvalue ?? null,
    error: job.failedReason ?? null,
  };
}

function rowToSyncJob(row: typeof syncJobResults.$inferSelect): SyncJob {
  return {
    id: row.id,
    jobType: row.jobType as SyncJobType,
    status: row.status as 'completed' | 'failed',
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    durationMs: row.durationMs ?? null,
    progress: row.progress
      ? (JSON.parse(row.progress) as SyncJobProgress)
      : { processed: 0, total: 0 },
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error ?? null,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const plexRouter = router({
  testConnection: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const connected = await plexService.testConnection(client);
      return { data: { connected } };
    } catch (err) {
      if (err instanceof PlexApiError) {
        return { data: { connected: false, error: err.message } };
      }
      throw err;
    }
  }),

  getLibraries: protectedProcedure.query(async () => {
    const client = requirePlexClient();
    try {
      const libraries = await client.getLibraries();
      return { data: libraries };
    } catch (err) {
      if (err instanceof PlexApiError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Plex API error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  // ---------------------------------------------------------------------------
  // Background sync jobs (BullMQ)
  // ---------------------------------------------------------------------------

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

      const { jobType, sectionId, movieSectionId, tvSectionId } = input;

      // Build typed job data
      let jobData: SyncQueueJobData;
      switch (jobType) {
        case 'plexSyncMovies':
          if (!sectionId)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'sectionId is required for movie sync',
            });
          jobData = { type: 'plexSyncMovies', sectionId };
          break;
        case 'plexSyncTvShows':
          if (!sectionId)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'sectionId is required for TV sync',
            });
          jobData = { type: 'plexSyncTvShows', sectionId };
          break;
        case 'plexSyncWatchlist':
          jobData = { type: 'plexSyncWatchlist' };
          break;
        case 'plexSyncWatchHistory':
          jobData = {
            type: 'plexSyncWatchHistory',
            movieSectionId,
            tvSectionId,
          };
          break;
        case 'plexSyncDiscoverWatches':
          jobData = { type: 'plexSyncDiscoverWatches' };
          break;
      }

      try {
        const queue = getSyncQueue();
        // Check for an already-running or queued job of this type — prevents duplicates
        // without using a fixed jobId (which would block reruns after failure).
        const [active, waiting] = await Promise.all([
          queue.getJobs(['active']),
          queue.getJobs(['waiting']),
        ]);
        const existing = [...active, ...waiting].find((j) => j.data.type === jobType);
        if (existing) {
          return { data: { jobId: existing.id ?? jobType } };
        }
        const job = await queue.add(jobType, jobData);
        return { data: { jobId: job.id ?? jobType } };
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
      // Check BullMQ first (for running / recent jobs)
      const queue = getSyncQueue();
      const bullJob = await queue.getJob(input.jobId);
      if (bullJob) {
        return { data: bullmqJobToSyncJob(bullJob) };
      }

      // Fall back to sync_job_results table for older completed jobs
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

  getSyncStatus: protectedProcedure.query(() => {
    const client = plexService.getPlexClient();
    return { data: plexService.getSyncStatus(client) };
  }),

  setUrl: protectedProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      let finalUrl = input.url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `http://${finalUrl}`;
      }

      try {
        new URL(finalUrl);
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Invalid URL format. Please provide a valid address (e.g., http://192.168.1.100:32400)',
        });
      }

      const db = getDrizzle();
      const tokenRecord = db
        .select()
        .from(settings)
        .where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN))
        .get();
      const token = tokenRecord?.value;

      try {
        if (token) {
          console.warn(`[Plex] Validating full connection to ${finalUrl}...`);
          const testClient = new PlexClient(finalUrl, token);
          await testClient.getLibraries();
        } else {
          console.warn(`[Plex] Validating reachability for ${finalUrl}...`);
          const controller = new AbortController();
          const id = setTimeout(() => {
            controller.abort();
          }, 5000);

          try {
            const res = await fetch(`${finalUrl}/identity`, {
              signal: controller.signal,
              headers: { Accept: 'application/json' },
            });
            if (!res.ok && res.status !== 401) {
              throw new Error(`Server responded with ${res.status}`);
            }
          } finally {
            clearTimeout(id);
          }
        }
      } catch (err) {
        console.error(`[Plex] Connection validation failed for ${finalUrl}:`, err);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Could not connect to Plex server at ${finalUrl}. Verify the address is correct and the server is reachable.`,
        });
      }

      console.warn(`[Plex] Updating server URL to: ${finalUrl}`);
      db.insert(settings)
        .values({ key: SETTINGS_KEYS.PLEX_URL, value: finalUrl })
        .onConflictDoUpdate({ target: settings.key, set: { value: finalUrl } })
        .run();

      return { message: 'Plex URL updated and validated' };
    }),

  getPlexUrl: protectedProcedure.query(() => {
    return { data: plexService.getPlexUrl() };
  }),

  startScheduler: protectedProcedure
    .input(
      z
        .object({
          intervalMs: z.number().int().positive().optional(),
          movieSectionId: z.string().min(1).optional(),
          tvSectionId: z.string().min(1).optional(),
        })
        .optional()
    )
    .mutation(({ input }) => {
      const status = scheduler.startScheduler(input ?? {});
      return { data: status };
    }),

  stopScheduler: protectedProcedure.mutation(() => {
    const status = scheduler.stopScheduler();
    return { data: status };
  }),

  getSchedulerStatus: protectedProcedure.query(() => {
    return { data: scheduler.getSchedulerStatus() };
  }),

  getSyncLogs: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).optional() }).optional())
    .query(({ input }) => {
      return { data: scheduler.getSyncLogs(input?.limit ?? 20) };
    }),

  getSectionIds: protectedProcedure.query(() => {
    return { data: plexService.getPlexSectionIds() };
  }),

  saveSectionIds: protectedProcedure
    .input(
      z.object({
        movieSectionId: z.string().min(1).optional(),
        tvSectionId: z.string().min(1).optional(),
      })
    )
    .mutation(({ input }) => {
      plexService.savePlexSectionIds(input.movieSectionId, input.tvSectionId);
      return { message: 'Section IDs saved' };
    }),

  getAuthPin: protectedProcedure.mutation(async () => {
    const clientId = plexService.getPlexClientId();
    const res = await fetch('https://plex.tv/api/v2/pins?strong=false', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Plex-Product': 'POPS',
        'X-Plex-Client-Identifier': clientId,
      },
    });
    if (!res.ok) {
      const status = res.status;
      throw new TRPCError({
        code: status === 429 ? 'TOO_MANY_REQUESTS' : 'INTERNAL_SERVER_ERROR',
        message: `Failed to get Plex PIN (HTTP ${status})`,
      });
    }
    const data = (await res.json()) as { id: number; code: string };
    return { data: { id: data.id, code: data.code, clientId } };
  }),

  checkAuthPin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const clientId = plexService.getPlexClientId();
      const res = await fetch(`https://plex.tv/api/v2/pins/${input.id}`, {
        headers: {
          Accept: 'application/json',
          'X-Plex-Client-Identifier': clientId,
        },
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 404) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Invalid or expired PIN ID',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to check Plex PIN (HTTP ${status})`,
        });
      }

      const data = (await res.json()) as {
        authToken?: string | null;
        expiresAt?: string | null;
        username?: string | null;
      };

      if (data.expiresAt) {
        const expiresAt = new Date(data.expiresAt);
        if (expiresAt.getTime() < Date.now()) {
          return { data: { connected: false, expired: true } };
        }
      }

      console.warn(
        `[Plex] PIN check response for ${input.id}:`,
        data.authToken ? 'Token received' : 'No token yet'
      );

      if (data.authToken) {
        const db = getDrizzle();
        console.warn(`[Plex] Encrypting and saving token to database...`);
        const encryptedToken = plexService.encryptToken(data.authToken);
        db.insert(settings)
          .values({ key: SETTINGS_KEYS.PLEX_TOKEN, value: encryptedToken })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: encryptedToken },
          })
          .run();

        if (data.username) {
          db.insert(settings)
            .values({ key: SETTINGS_KEYS.PLEX_USERNAME, value: data.username })
            .onConflictDoUpdate({
              target: settings.key,
              set: { value: data.username },
            })
            .run();
        }

        return { data: { connected: true, username: data.username ?? null } };
      }
      return { data: { connected: false, expired: false } };
    }),

  getPlexUsername: protectedProcedure.query(() => {
    return { data: plexService.getPlexUsername() };
  }),

  disconnect: protectedProcedure.mutation(() => {
    const db = getDrizzle();
    db.delete(settings)
      .where(inArray(settings.key, [SETTINGS_KEYS.PLEX_TOKEN, SETTINGS_KEYS.PLEX_USERNAME]))
      .run();
    return { message: 'Disconnected from Plex' };
  }),
});
