import { config } from 'dotenv';

config();
config({ path: '../../.env', override: false });

import { Worker } from 'bullmq';
import pino from 'pino';

import { moveToDeadLetter } from './jobs/dead-letter.js';
import { process as processCuration } from './jobs/handlers/curation.js';
import { process as processDefault } from './jobs/handlers/default.js';
import { process as processEmbeddings } from './jobs/handlers/embeddings.js';
import {
  CURATION_QUEUE,
  DEFAULT_QUEUE,
  EMBEDDINGS_QUEUE,
  QUEUE_CONCURRENCY,
} from './jobs/queues.js';
import { createRedisConnection } from './jobs/redis.js';

import type {
  CurationQueueJobData,
  DefaultQueueJobData,
  EmbeddingsQueueJobData,
} from './jobs/types.js';

const logger = pino({ name: 'pops-worker' });

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
const allWorkers = [embeddingsWorker, curationWorker, defaultWorker];

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
