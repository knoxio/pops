import pino from 'pino';

import { syncJobResults } from '@pops/db-types';

import { getDrizzle } from '../db.js';

import type { SyncQueueJobData } from './types.js';

const logger = pino({ name: 'pops-worker:sync-results' });

const PERSISTED_SYNC_TYPES = new Set([
  'plexSyncMovies',
  'plexSyncTvShows',
  'plexSyncWatchlist',
  'plexSyncWatchHistory',
  'plexSyncDiscoverWatches',
]);

export interface PersistSyncResultParams {
  jobId: string | undefined;
  data: SyncQueueJobData;
  status: 'completed' | 'failed';
  result: unknown;
  error: string | null;
  processedOn: number | null | undefined;
  finishedOn: number | null | undefined;
  progress?: unknown;
}

export function persistSyncResult(params: PersistSyncResultParams): void {
  const { jobId, data, status, result, error, processedOn, finishedOn, progress } = params;
  if (!jobId || !PERSISTED_SYNC_TYPES.has(data.type)) return;

  try {
    const db = getDrizzle();
    const startedAt = processedOn ? new Date(processedOn).toISOString() : new Date().toISOString();
    const completedAt = finishedOn ? new Date(finishedOn).toISOString() : new Date().toISOString();
    const durationMs = processedOn && finishedOn ? finishedOn - processedOn : null;
    const progressJson =
      progress != null ? JSON.stringify(progress) : JSON.stringify({ processed: 0, total: 0 });
    const resultJson = result != null ? JSON.stringify(result) : null;

    db.insert(syncJobResults)
      .values({
        id: jobId,
        jobType: data.type,
        status,
        startedAt,
        completedAt,
        durationMs,
        progress: progressJson,
        result: resultJson,
        error,
      })
      .onConflictDoUpdate({
        target: syncJobResults.id,
        set: {
          status,
          completedAt,
          durationMs,
          progress: progressJson,
          result: resultJson,
          error,
        },
      })
      .run();
  } catch (err) {
    logger.error({ err }, 'Failed to persist sync result');
  }
}
