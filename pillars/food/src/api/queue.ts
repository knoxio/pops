/**
 * BullMQ producer for the `food.ingest` queue, pillar-side.
 *
 * The food-api container is the producer (enqueue / status / cancel /
 * retry); the consumer runs in `pillars/food/src/worker`. Lazy singleton,
 * closed on graceful shutdown. Returns `null` when Redis is not configured
 * so tests + dev runs without Redis don't blow up at module init (the start
 * handler maps the resulting `IngestQueueUnavailable` to 503).
 */
import { type DefaultJobOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { FOOD_INGEST_QUEUE_NAME, type IngestJobData } from '../contract/queue/index.js';

const ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 5_000;
const REMOVE_KEEP_COUNT = 1_000;

export const FOOD_INGEST_JOB_OPTIONS: DefaultJobOptions = {
  attempts: ATTEMPTS,
  backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
  removeOnComplete: { count: REMOVE_KEEP_COUNT },
  removeOnFail: { count: REMOVE_KEEP_COUNT },
};

function resolveRedisUrl(): string | null {
  const url = process.env['REDIS_URL'];
  if (url !== undefined && url.length > 0) return url;
  const host = process.env['REDIS_HOST'];
  if (host === undefined || host.length === 0) return null;
  return `redis://${host}:${process.env['REDIS_PORT'] ?? '6379'}`;
}

let queueSingleton: Queue<IngestJobData> | null = null;
let redisDisabled = false;

export function getFoodIngestQueue(): Queue<IngestJobData> | null {
  if (redisDisabled) return null;
  if (queueSingleton !== null) return queueSingleton;
  const redisUrl = resolveRedisUrl();
  if (redisUrl === null) {
    redisDisabled = true;
    return null;
  }
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
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
