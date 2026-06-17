/**
 * Handlers for the `plex.*` sync routes (slice 9b) — on-demand sync ops over
 * the in-process job runner.
 *
 * `startSyncJob` inserts a `running` row, fires `runSyncJob` ASYNC (NOT
 * awaited), and returns the `jobId` immediately; the fire-and-forget promise
 * patches the row to `completed`+result or `failed`+error on settle. The
 * poll/list/last routes read straight from `sync_job_results`.
 *
 * NOTE: `plexSyncDiscoverWatches` is unsupported — the contract enum excludes
 * it (Plex Discover + rotation domain, deferred to wave 3).
 */
import { randomUUID } from 'node:crypto';

import { type MediaDb, syncJobResultsService } from '../../db/index.js';
import { getPlexClient } from '../clients/plex/index.js';
import { SYNC_JOB_TYPES, runSyncJob, type StartSyncJobInput } from '../clients/plex/sync/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaPlexContract } from '../../contract/rest-plex.js';

type Req = ServerInferRequest<typeof mediaPlexContract>;

function finalise(db: MediaDb, jobId: string, startedAt: number, result: unknown): void {
  const completedAt = new Date();
  syncJobResultsService.updateSyncJobResult(db, jobId, {
    status: 'completed',
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt,
    result,
  });
}

function fail(db: MediaDb, jobId: string, startedAt: number, err: unknown): void {
  const completedAt = new Date();
  syncJobResultsService.updateSyncJobResult(db, jobId, {
    status: 'failed',
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt,
    error: err instanceof Error ? err.message : String(err),
  });
}

function launch(db: MediaDb, input: StartSyncJobInput): string {
  const jobId = randomUUID();
  const startedAtMs = Date.now();
  syncJobResultsService.insertSyncJobResult(db, {
    id: jobId,
    jobType: input.jobType,
    status: 'running',
    startedAt: new Date(startedAtMs).toISOString(),
    progress: { processed: 0, total: 0 },
  });
  void runSyncJob(db, input)
    .then((result) => finalise(db, jobId, startedAtMs, result))
    .catch((err: unknown) => fail(db, jobId, startedAtMs, err));
  return jobId;
}

export function makePlexSyncHandlers(db: MediaDb) {
  return {
    startSyncJob: ({ body }: Req['startSyncJob']) =>
      runHttp(() => {
        if (getPlexClient(db) === null) throw new ConflictError('Plex is not configured');
        const jobId = launch(db, body);
        return { status: 200 as const, body: { data: { jobId } } };
      }),

    getActiveSyncJobs: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: syncJobResultsService.listActive(db) },
      })),

    getLastSyncResults: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: syncJobResultsService.lastByType(db, SYNC_JOB_TYPES) },
      })),

    getSyncJobStatus: ({ params }: Req['getSyncJobStatus']) =>
      runHttp(() => {
        const job = syncJobResultsService.getSyncJobResult(db, params.jobId);
        if (!job) throw new NotFoundError('Sync job', params.jobId);
        return { status: 200 as const, body: { data: job } };
      }),
  };
}
