/**
 * `plex.*` sync routes — on-demand sync ops backed by the in-process job
 * runner (slice 9b). Merged into `mediaPlexContract` so operation ids stay
 * `plex.<route>`.
 *
 * Re-architecture vs the monolith: the monolith enqueued to a `pops-sync`
 * BullMQ queue; the pillar runs the sync ASYNC in-process and persists status
 * to `sync_job_results`. `startSyncJob` returns a `jobId` immediately; callers
 * poll `getSyncJobStatus`.
 *
 * Deferred: the `plexSyncDiscoverWatches` job type (Plex Discover + rotation
 * domain — wave 3) is deliberately absent from the `jobType` enum.
 */
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

export const SYNC_JOB_TYPE_ENUM = [
  'plexSyncMovies',
  'plexSyncTvShows',
  'plexSyncWatchlist',
  'plexSyncWatchHistory',
] as const;

const SyncJobTypeSchema = z.enum(SYNC_JOB_TYPE_ENUM);

const SyncJobProgressSchema = z.object({
  processed: z.number(),
  total: z.number(),
});

const SyncJobSchema = z.object({
  id: z.string(),
  jobType: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  progress: SyncJobProgressSchema,
  result: z.unknown(),
  error: z.string().nullable(),
});

const SectionId = z.string().min(1).optional();

/**
 * Route map merged into `mediaPlexContract`. The static `/plex/sync/active`
 * and `/plex/sync/last` paths are declared before the `/plex/sync/:jobId`
 * param route so Express matches them first.
 */
export const plexSyncRoutes = {
  startSyncJob: {
    method: 'POST',
    path: '/plex/sync',
    body: z.object({
      jobType: SyncJobTypeSchema,
      sectionId: SectionId,
      movieSectionId: SectionId,
      tvSectionId: SectionId,
    }),
    responses: { 200: z.object({ data: z.object({ jobId: z.string() }) }), ...ERR_RESPONSES },
    summary: 'Start an on-demand Plex sync job (runs async in-process)',
  },
  getActiveSyncJobs: {
    method: 'GET',
    path: '/plex/sync/active',
    responses: { 200: z.object({ data: z.array(SyncJobSchema) }) },
    summary: 'List currently-running sync jobs',
  },
  getLastSyncResults: {
    method: 'GET',
    path: '/plex/sync/last',
    responses: {
      200: z.object({ data: z.record(z.string(), SyncJobSchema.nullable()) }),
    },
    summary: 'Most recent completed result per sync job type',
  },
  getSyncJobStatus: {
    method: 'GET',
    path: '/plex/sync/:jobId',
    pathParams: z.object({ jobId: z.string().min(1) }),
    responses: { 200: z.object({ data: SyncJobSchema }), ...ERR_RESPONSES },
    summary: 'Poll a sync job by id (404 if unknown)',
  },
} as const;
