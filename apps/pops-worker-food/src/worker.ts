/**
 * PRD-126 — pops-worker-food daemon entry point.
 *
 * Connects to the `food.ingest` BullMQ queue (contract from
 * `@pops/food-contracts`), dispatches each job to its per-kind handler
 * via `runIngestJob`, and POSTs the result back to pops-api's
 * `food.ingest.workerComplete` mutation. Auth uses the shared
 * `POPS_API_INTERNAL_TOKEN` secret in the `x-pops-internal-token`
 * header (PRD-125 contract).
 *
 * Lifecycle:
 *   1. `loadConfig()` reads env (fails fast on missing token).
 *   2. BullMQ Worker starts with the configured concurrency + rate limiter.
 *   3. A small HTTP server on `FOOD_WORKER_HEALTH_PORT` exposes /healthz.
 *   4. SIGTERM triggers `worker.close()` which drains active jobs up to
 *      `FOOD_WORKER_DRAIN_TIMEOUT_MS` (60s default) before the process
 *      exits.
 *
 * Cancellation is cooperative — handlers check `ctx.isCancelled()`
 * between pipeline stages. We forward `job.isToBeRemoved()` from BullMQ
 * so a `cancel` from the API surfaces inside the running handler.
 */
import { Worker } from 'bullmq';
import pino from 'pino';

import { FOOD_INGEST_QUEUE_NAME } from '@pops/food-contracts';

import { createApiClient, postWorkerComplete } from './api-client.js';
import { loadConfig } from './config.js';
import { runIngestJob } from './dispatch.js';
import { startHealthServer } from './health.js';
import { createRedisConnection } from './redis.js';

import type { Job } from 'bullmq';

import type { IngestJobData, IngestJobResult } from '@pops/food-contracts';

import type { TrpcClient } from './api-client.js';
import type { WorkerConfig } from './config.js';
import type { HandlerContext } from './handlers/types.js';

const logger = pino({ name: 'pops-worker-food' });

/**
 * Cancellation contract: PRD-125's `food.ingest.cancel` calls `job.remove()`,
 * which deletes the BullMQ row but does NOT abort an already-running
 * processor. The processor cooperatively polls `job.getState()` between
 * stages — once removed, the state is `'unknown'`. This is the same
 * pattern the PRD-126 spec sketches as "isToBeRemoved", which is not a
 * real BullMQ method.
 */
async function isJobCancelled(job: Job<IngestJobData>): Promise<boolean> {
  try {
    return (await job.getState()) === 'unknown';
  } catch {
    return true;
  }
}

async function processJob(job: Job<IngestJobData>, client: TrpcClient): Promise<IngestJobResult> {
  const ctx: HandlerContext = { isCancelled: () => isJobCancelled(job) };
  const result = await runIngestJob(job.data, ctx);
  try {
    await postWorkerComplete(client, job.data.sourceId, result);
  } catch (err) {
    logger.error(
      { err, jobId: job.id, sourceId: job.data.sourceId },
      'workerComplete callback failed; BullMQ will retry the job'
    );
    throw err;
  }
  return result;
}

export async function startWorker(config: WorkerConfig): Promise<{
  worker: Worker<IngestJobData, IngestJobResult>;
  shutdown: () => Promise<void>;
}> {
  const connection = createRedisConnection(config.redisUrl);
  const client = createApiClient({
    apiUrl: config.apiUrl,
    internalToken: config.internalToken,
  });

  const worker = new Worker<IngestJobData, IngestJobResult>(
    FOOD_INGEST_QUEUE_NAME,
    (job) => processJob(job, client),
    {
      connection,
      concurrency: config.concurrency,
      limiter: { max: config.ratePerMin, duration: 60_000 },
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(
      {
        jobId: job.id,
        sourceId: job.data.sourceId,
        kind: job.data.kind,
        ok: result.ok,
      },
      'job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, sourceId: job?.data.sourceId, err }, 'job failed');
  });

  const activeJobs = new Set<string>();
  worker.on('active', (job) => {
    if (job.id != null) activeJobs.add(job.id);
  });
  worker.on('completed', (job) => {
    if (job.id != null) activeJobs.delete(job.id);
  });
  worker.on('failed', (job) => {
    if (job?.id != null) activeJobs.delete(job.id);
  });

  const healthServer = startHealthServer(config.healthPort, {
    isQueueRunning: () => worker.isRunning(),
    getActiveJobCount: () => activeJobs.size,
  });

  const shutdown = async (): Promise<void> => {
    logger.info('shutting down');
    await Promise.race([
      worker.close(),
      new Promise((resolve) => setTimeout(resolve, config.drainTimeoutMs)),
    ]);
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
    await connection.quit();
  };

  return { worker, shutdown };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { shutdown } = await startWorker(config);
  logger.info(
    { concurrency: config.concurrency, ratePerMin: config.ratePerMin },
    'pops-worker-food started'
  );

  const onSignal = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'received shutdown signal');
    shutdown()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'shutdown failed');
        process.exit(1);
      });
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    logger.error({ err }, 'worker bootstrap failed');
    process.exit(1);
  });
}
