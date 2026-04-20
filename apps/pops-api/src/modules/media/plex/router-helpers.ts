import { TRPCError } from '@trpc/server';

import * as plexService from './service.js';

import type { Job } from 'bullmq';

import type { syncJobResults } from '@pops/db-types';

import type { SyncQueueJobData } from '../../../jobs/types.js';
import type { PlexClient } from './client.js';

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

export function requirePlexClient(): PlexClient {
  const client = plexService.getPlexClient();
  if (!client) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Plex is not configured. Connect to Plex in settings first.',
    });
  }
  return client;
}

function determineState(job: Job<SyncQueueJobData>): SyncJob['status'] {
  if (job.finishedOn != null && !job.failedReason) return 'completed';
  if (job.failedReason) return 'failed';
  return 'running';
}

export function bullmqJobToSyncJob(job: Job<SyncQueueJobData>): SyncJob {
  const progress = (job.progress ?? { processed: 0, total: 0 }) as SyncJobProgress;
  return {
    id: job.id ?? '',
    jobType: job.data.type as SyncJobType,
    status: determineState(job),
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

export function rowToSyncJob(row: typeof syncJobResults.$inferSelect): SyncJob {
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
