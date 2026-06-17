/**
 * BullMQ producer for the `pops-curation` queue, pillar-side.
 *
 * cerebrum-api is the *producer* — it enqueues `classifyEngram` jobs from
 * `quickCapture` / `retryEnrichment`. The consumer (the curation worker) still
 * runs in the monolith, so this file only declares the enqueue surface, not a
 * worker. Mirrors the food pillar's lazy-singleton `queue.ts`: returns `null`
 * when Redis is not configured so tests + dev runs without Redis don't blow up
 * at module init. Closed on graceful shutdown via {@link closeCerebrumIngestQueue}.
 */
import { type DefaultJobOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';

/** Must match the monolith's `CURATION_QUEUE` name so the worker picks jobs up. */
export const CURATION_QUEUE_NAME = 'pops-curation';

/**
 * Payload for the `classifyEngram` curation job. Kept minimal and local — the
 * pillar only produces this one job shape; the worker's full
 * `CurationQueueJobData` union stays in the monolith.
 */
export interface ClassifyEngramJobData {
  type: 'classifyEngram';
  engramId: string;
}

const ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 5_000;
const REMOVE_KEEP_COUNT = 1_000;

export const CURATION_JOB_OPTIONS: DefaultJobOptions = {
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

let queueSingleton: Queue<ClassifyEngramJobData> | null = null;
let redisDisabled = false;

/** Lazy curation-queue singleton. Returns `null` when Redis is unconfigured. */
export function getCurationQueue(): Queue<ClassifyEngramJobData> | null {
  if (redisDisabled) return null;
  if (queueSingleton !== null) return queueSingleton;
  const redisUrl = resolveRedisUrl();
  if (redisUrl === null) {
    redisDisabled = true;
    return null;
  }
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  queueSingleton = new Queue<ClassifyEngramJobData>(CURATION_QUEUE_NAME, {
    connection,
    defaultJobOptions: CURATION_JOB_OPTIONS,
  });
  return queueSingleton;
}

export async function closeCerebrumIngestQueue(): Promise<void> {
  await queueSingleton?.close();
  queueSingleton = null;
  redisDisabled = false;
}
