import pino from 'pino';

import { PERSISTED_SYNC_TYPES, syncResultsService } from '@pops/core-db';

import { getCoreDrizzle } from '../db.js';

import type { SyncQueueJobData } from './types.js';

const logger = pino({ name: 'pops-worker:sync-results' });

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

/**
 * Thin caller that adapts the BullMQ worker callback shape into the
 * `@pops/core-db` `syncResultsService.persist` contract. Only the five
 * Plex job types in {@link PERSISTED_SYNC_TYPES} are written; everything
 * else is observed via Redis and short-circuits here.
 *
 * Writes resolve against the core pillar handle (`getCoreDrizzle()`)
 * now that PRD-186 PR 4 cut the `sync_job_results` table over into
 * `core.db`. The shared `pops.db` copy still exists for fallback.
 */
export function persistSyncResult(params: PersistSyncResultParams): void {
  const { jobId, data, status, result, error, processedOn, finishedOn, progress } = params;
  if (!jobId || !PERSISTED_SYNC_TYPES.has(data.type)) return;

  try {
    const startedAt = processedOn ? new Date(processedOn).toISOString() : new Date().toISOString();
    const completedAt = finishedOn ? new Date(finishedOn).toISOString() : new Date().toISOString();
    const durationMs = processedOn && finishedOn ? finishedOn - processedOn : null;
    const progressJson =
      progress != null ? JSON.stringify(progress) : JSON.stringify({ processed: 0, total: 0 });
    const resultJson = result != null ? JSON.stringify(result) : null;

    syncResultsService.persist(getCoreDrizzle(), {
      id: jobId,
      jobType: data.type,
      status,
      startedAt,
      completedAt,
      durationMs,
      progressJson,
      resultJson,
      error,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to persist sync result');
  }
}
