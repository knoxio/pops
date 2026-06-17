/**
 * BullMQ producer for the `pops-embeddings` queue, pillar-side.
 *
 * cerebrum-api is the *producer* — the thalamus index procs enqueue embedding
 * jobs (one per changed engram on `reindex --force`, one per changed source row
 * on `reindexSources`). The consumer (the embeddings worker) still runs in the
 * monolith, so this file only declares the enqueue surface. Mirrors the ingest
 * slice's lazy-singleton `queue.ts`: returns `null` when Redis is unconfigured
 * so tests + dev runs without Redis don't blow up at module init. Closed on
 * graceful shutdown via {@link closeCerebrumEmbeddingsQueue}.
 */
import { type DefaultJobOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';

/** Must match the monolith's `EMBEDDINGS_QUEUE` name so the worker picks jobs up. */
export const EMBEDDINGS_QUEUE_NAME = 'pops-embeddings';

/**
 * Payload for an embedding job. `content` is optional — when omitted the worker
 * fetches it from the source table. Kept minimal and local; the worker's full
 * job-data union stays in the monolith.
 */
export interface EmbeddingJobData {
  sourceType: string;
  sourceId: string;
  content?: string;
}

const ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 5_000;
const REMOVE_KEEP_COUNT = 1_000;

export const EMBEDDINGS_JOB_OPTIONS: DefaultJobOptions = {
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

let queueSingleton: Queue<EmbeddingJobData> | null = null;
let redisDisabled = false;

/** Lazy embeddings-queue singleton. Returns `null` when Redis is unconfigured. */
export function getEmbeddingsQueue(): Queue<EmbeddingJobData> | null {
  if (redisDisabled) return null;
  if (queueSingleton !== null) return queueSingleton;
  const redisUrl = resolveRedisUrl();
  if (redisUrl === null) {
    redisDisabled = true;
    return null;
  }
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  queueSingleton = new Queue<EmbeddingJobData>(EMBEDDINGS_QUEUE_NAME, {
    connection,
    defaultJobOptions: EMBEDDINGS_JOB_OPTIONS,
  });
  return queueSingleton;
}

/** Accessor signature so tests can inject a `() => null` (no-Redis) producer. */
export type EmbeddingsQueueAccessor = () => Queue<EmbeddingJobData> | null;

export async function closeCerebrumEmbeddingsQueue(): Promise<void> {
  await queueSingleton?.close();
  queueSingleton = null;
  redisDisabled = false;
}
