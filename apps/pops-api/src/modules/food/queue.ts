/**
 * PRD-125 — BullMQ producer for the `food.ingest` queue.
 *
 * pops-api is the producer (enqueue, status, cancel, retry); the consumer
 * runs in `pops-worker-food` (PRD-126's separate container). The queue
 * name + job-data shape are defined in `@pops/food-contracts` so both
 * sides agree on a single source of truth.
 *
 * Lazy singleton; closed on graceful shutdown via `closeFoodIngestQueue`.
 * Mirrors the pattern in `apps/pops-api/src/jobs/queues.ts` so the new
 * food.* queues compose into the same lifecycle.
 *
 * `FOOD_INGEST_RATE_PER_MIN` controls the worker-side rate limiter (default
 * 30/min — conservative bound against runaway Anthropic spend). The
 * producer doesn't enforce it; the consumer in PRD-126 reads the same
 * env var and passes it to BullMQ's `limiter`.
 */
import { Queue } from 'bullmq';
import pino from 'pino';

import { FOOD_INGEST_QUEUE_NAME, type IngestJobData } from '@pops/food/queue';

import { createRedisConnection } from '../../jobs/redis.js';

import type { DefaultJobOptions } from 'bullmq';

const logger = pino({ name: 'pops-jobs:food-ingest' });

// Defaults documented in PRD-125. All three are env-overridable.
const DEFAULT_RATE_PER_MIN = 30;
const DEFAULT_TIMEOUT_SEC = 300;
const DEFAULT_CONCURRENCY = 2;
/** Worker-side stalled-job tunables; passed through `IngestRuntimeConfig` for PRD-126. */
export const FOOD_INGEST_STALLED_INTERVAL_MS = 30_000;
export const FOOD_INGEST_MAX_STALLED_COUNT = 1;
const ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 5_000;
const REMOVE_KEEP_COUNT = 1_000;

export const FOOD_INGEST_JOB_OPTIONS: DefaultJobOptions = {
  attempts: ATTEMPTS,
  backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS }, // 5s, 10s, 20s
  removeOnComplete: { count: REMOVE_KEEP_COUNT },
  removeOnFail: { count: REMOVE_KEEP_COUNT },
};

/** Per-PRD: 30 jobs/min default, env-tunable for tighter / looser caps. */
export function getFoodIngestRatePerMin(): number {
  const raw = process.env['FOOD_INGEST_RATE_PER_MIN'];
  const parsed = raw === undefined ? DEFAULT_RATE_PER_MIN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_PER_MIN;
}

export function getFoodIngestTimeoutSec(): number {
  const raw = process.env['FOOD_INGEST_TIMEOUT_SEC'];
  const parsed = raw === undefined ? DEFAULT_TIMEOUT_SEC : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_SEC;
}

export function getFoodWorkerConcurrency(): number {
  const raw = process.env['FOOD_WORKER_CONCURRENCY'];
  const parsed = raw === undefined ? DEFAULT_CONCURRENCY : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_CONCURRENCY;
}

let queueSingleton: Queue<IngestJobData> | null = null;
let redisDisabled = false;

/**
 * Returns the lazy singleton. Returns null when Redis is not configured
 * (matches the sibling queue pattern — keeps tests + dev runs without
 * Redis from blowing up at module init).
 *
 * `stalledInterval` + `maxStalledCount` are queue-side; PRD-126's
 * worker reads `FOOD_INGEST_RATE_PER_MIN` and `FOOD_INGEST_TIMEOUT_SEC`
 * directly for its own `limiter` + `lockDuration`.
 */
export function getFoodIngestQueue(): Queue<IngestJobData> | null {
  if (redisDisabled) return null;
  if (queueSingleton !== null) return queueSingleton;
  if (process.env['REDIS_HOST'] === undefined && process.env['REDIS_URL'] === undefined) {
    // Mirror queues.ts: warn once and disable so the API stays up.
    logger.warn(
      { queue: FOOD_INGEST_QUEUE_NAME },
      'Redis unavailable — food.ingest queue disabled (REDIS_HOST / REDIS_URL not set)'
    );
    redisDisabled = true;
    return null;
  }
  const connection = createRedisConnection();
  queueSingleton = new Queue<IngestJobData>(FOOD_INGEST_QUEUE_NAME, {
    connection,
    defaultJobOptions: FOOD_INGEST_JOB_OPTIONS,
  });
  return queueSingleton;
}

export async function closeFoodIngestQueue(): Promise<void> {
  await queueSingleton?.close();
  queueSingleton = null;
  redisDisabled = false;
}
