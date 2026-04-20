import { config } from 'dotenv';

config();
config({ path: '../../.env', override: false });

import { Worker } from 'bullmq';
import pino from 'pino';

import { moveToDeadLetter } from './jobs/dead-letter.js';
import { process as processCuration } from './jobs/handlers/curation.js';
import { process as processDefault } from './jobs/handlers/default.js';
import { process as processEmbeddings } from './jobs/handlers/embeddings.js';
import { process as processSync } from './jobs/handlers/sync.js';
import {
  CURATION_QUEUE,
  DEFAULT_QUEUE,
  EMBEDDINGS_QUEUE,
  QUEUE_CONCURRENCY,
  SYNC_QUEUE,
} from './jobs/queues.js';
import { createRedisConnection } from './jobs/redis.js';
import { persistSyncResult } from './jobs/sync-results.js';
import { writeSyncLog } from './modules/media/plex/scheduler.js';

import type {
  CurationQueueJobData,
  DefaultQueueJobData,
  EmbeddingsQueueJobData,
  SyncQueueJobData,
} from './jobs/types.js';

const logger = pino({ name: 'pops-worker' });

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

function emitScheduledSyncLog(
  job: { data: SyncQueueJobData; processedOn?: number; finishedOn?: number },
  result: unknown
): void {
  if (job.data.type !== 'plexScheduledSync') return;
  const r = result as { movieCount: number; tvCount: number; errors: string[] } | null;
  writeSyncLog({
    syncedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : new Date().toISOString(),
    movieCount: r?.movieCount ?? 0,
    tvCount: r?.tvCount ?? 0,
    errors: r?.errors?.length ? r.errors : null,
    durationMs: job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : null,
  });
}

syncWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Sync job completed');
  persistSyncResult({
    jobId: job.id,
    data: job.data,
    status: 'completed',
    result,
    error: null,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    progress: job.progress,
  });
  emitScheduledSyncLog(job, result);
});

syncWorker.on('failed', (job, err) => {
  if (!job) return;
  logger.error(
    { jobId: job.id, queue: SYNC_QUEUE, attempt: job.attemptsMade, error: err.message },
    'Sync job failed'
  );
  const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!exhausted) return;

  persistSyncResult({
    jobId: job.id,
    data: job.data,
    status: 'failed',
    result: null,
    error: err.message,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    progress: job.progress,
  });
  moveToDeadLetter({
    queue: SYNC_QUEUE,
    jobId: job.id,
    jobName: job.name,
    data: job.data,
    attemptsMade: job.attemptsMade,
    err,
    removeOriginal: () => job.remove(),
  });
});

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
    if (!exhausted) return;
    moveToDeadLetter({
      queue,
      jobId: job.id,
      jobName: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      err,
      removeOriginal: () => job.remove(),
    });
  });
}

logger.info('pops-worker started');

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
