import { config } from 'dotenv';

// Load env vars using the same pattern as the API server
config();
config({ path: '../../.env', override: false });

import { Worker } from 'bullmq';
import pino from 'pino';

import { syncJobResults } from '@pops/db-types';

import { getDrizzle } from './db.js';
import { process as processCuration } from './jobs/handlers/curation.js';
import { process as processDefault } from './jobs/handlers/default.js';
import { process as processEmbeddings } from './jobs/handlers/embeddings.js';
import { process as processSync } from './jobs/handlers/sync.js';
import {
  CURATION_QUEUE,
  DEFAULT_QUEUE,
  DEAD_LETTER_QUEUE,
  EMBEDDINGS_QUEUE,
  QUEUE_CONCURRENCY,
  SYNC_QUEUE,
  getDeadLetterQueue,
} from './jobs/queues.js';
import { createRedisConnection } from './jobs/redis.js';
import { writeSyncLog } from './modules/media/plex/scheduler.js';

import type {
  CurationQueueJobData,
  DefaultQueueJobData,
  EmbeddingsQueueJobData,
  SyncQueueJobData,
} from './jobs/types.js';

const logger = pino({ name: 'pops-worker' });

// ---------------------------------------------------------------------------
// Worker instances (one per queue)
// ---------------------------------------------------------------------------

const syncWorker = new Worker<SyncQueueJobData>(SYNC_QUEUE, processSync, {
  connection: createRedisConnection(),
  concurrency: QUEUE_CONCURRENCY[SYNC_QUEUE],
  stalledInterval: 30_000,
});

const embeddingsWorker = new Worker<EmbeddingsQueueJobData>(EMBEDDINGS_QUEUE, processEmbeddings, {
  connection: createRedisConnection(),
  concurrency: QUEUE_CONCURRENCY[EMBEDDINGS_QUEUE],
  stalledInterval: 30_000,
});

const curationWorker = new Worker<CurationQueueJobData>(CURATION_QUEUE, processCuration, {
  connection: createRedisConnection(),
  concurrency: QUEUE_CONCURRENCY[CURATION_QUEUE],
  stalledInterval: 30_000,
});

const defaultWorker = new Worker<DefaultQueueJobData>(DEFAULT_QUEUE, processDefault, {
  connection: createRedisConnection(),
  concurrency: QUEUE_CONCURRENCY[DEFAULT_QUEUE],
  stalledInterval: 30_000,
});

// ---------------------------------------------------------------------------
// Sync worker events — persist results + dead-letter exhausted jobs
// ---------------------------------------------------------------------------

syncWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Sync job completed');
  persistSyncResult(
    job.id,
    job.data,
    'completed',
    result,
    null,
    job.processedOn,
    job.finishedOn,
    job.progress
  );

  if (job.data.type === 'plexScheduledSync') {
    const r = result as { movieCount: number; tvCount: number; errors: string[] } | null;
    writeSyncLog(
      job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date().toISOString(),
      r?.movieCount ?? 0,
      r?.tvCount ?? 0,
      r?.errors?.length ? r.errors : null,
      job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : null
    );
  }
});

syncWorker.on('failed', (job, err) => {
  if (!job) return;
  logger.error(
    {
      jobId: job.id,
      queue: SYNC_QUEUE,
      attempt: job.attemptsMade,
      error: err.message,
    },
    'Sync job failed'
  );
  const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (exhausted) {
    persistSyncResult(
      job.id,
      job.data,
      'failed',
      null,
      err.message,
      job.processedOn,
      job.finishedOn,
      job.progress
    );
    moveToDeadLetter(SYNC_QUEUE, job.id, job.name, job.data, job.attemptsMade, err, () =>
      job.remove()
    );
  }
});

// ---------------------------------------------------------------------------
// Shared failure handler for other queues
// ---------------------------------------------------------------------------

for (const [worker, queue] of [
  [embeddingsWorker, EMBEDDINGS_QUEUE],
  [curationWorker, CURATION_QUEUE],
  [defaultWorker, DEFAULT_QUEUE],
] as const) {
  worker.on('failed', (job, err) => {
    if (!job) return;
    logger.error(
      { jobId: job.id, queue, attempt: job.attemptsMade, error: err.message },
      'Job failed'
    );
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (exhausted) {
      moveToDeadLetter(queue, job.id, job.name, job.data, job.attemptsMade, err, () =>
        job.remove()
      );
    }
  });
}

logger.info('pops-worker started');

// ---------------------------------------------------------------------------
// Graceful shutdown (30 s timeout)
// ---------------------------------------------------------------------------

const SHUTDOWN_TIMEOUT_MS = 30_000;
const allWorkers = [syncWorker, embeddingsWorker, curationWorker, defaultWorker];

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down');
  await Promise.all(allWorkers.map((w) => w.close()));
  logger.info('Worker shutdown complete');
  process.exit(0);
}

function scheduleShutdown(signal: string): void {
  const timer = setTimeout(() => {
    logger.warn('Shutdown timeout — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();
  shutdown(signal).catch((err: unknown) => {
    logger.error({ err }, 'Shutdown error');
    process.exit(1);
  });
}

process.once('SIGTERM', () => scheduleShutdown('SIGTERM'));
process.once('SIGINT', () => scheduleShutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERSISTED_SYNC_TYPES = new Set([
  'plexSyncMovies',
  'plexSyncTvShows',
  'plexSyncWatchlist',
  'plexSyncWatchHistory',
  'plexSyncDiscoverWatches',
]);

function persistSyncResult(
  jobId: string | undefined,
  data: SyncQueueJobData,
  status: 'completed' | 'failed',
  result: unknown,
  error: string | null,
  processedOn: number | null | undefined,
  finishedOn: number | null | undefined,
  progress?: unknown
): void {
  if (!jobId || !PERSISTED_SYNC_TYPES.has(data.type)) return;
  try {
    const db = getDrizzle();
    const startedAt = processedOn ? new Date(processedOn).toISOString() : new Date().toISOString();
    const completedAt = finishedOn ? new Date(finishedOn).toISOString() : new Date().toISOString();
    const durationMs = processedOn && finishedOn ? finishedOn - processedOn : null;

    db.insert(syncJobResults)
      .values({
        id: jobId,
        jobType: data.type,
        status,
        startedAt,
        completedAt,
        durationMs,
        progress:
          progress != null ? JSON.stringify(progress) : JSON.stringify({ processed: 0, total: 0 }),
        result: result != null ? JSON.stringify(result) : null,
        error,
      })
      .onConflictDoUpdate({
        target: syncJobResults.id,
        set: {
          status,
          completedAt,
          durationMs,
          result: result != null ? JSON.stringify(result) : null,
          error,
        },
      })
      .run();
  } catch (err) {
    logger.error({ err }, 'Failed to persist sync result');
  }
}

function moveToDeadLetter(
  queue: string,
  jobId: string | undefined,
  jobName: string,
  data: unknown,
  attemptsMade: number,
  err: Error,
  removeOriginal?: () => Promise<void>
): void {
  void getDeadLetterQueue()
    .add(DEAD_LETTER_QUEUE, {
      originalQueue: queue,
      originalJobId: jobId,
      originalJobName: jobName,
      originalData: data,
      failedAt: new Date().toISOString(),
      attemptsMade,
      finalError: err.message,
      finalErrorStack: err.stack,
    })
    .then(() => removeOriginal?.())
    .catch((addErr: unknown) => {
      logger.error({ addErr }, 'Failed to move job to dead-letter queue');
    });
}
