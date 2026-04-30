import { Queue } from 'bullmq';
import pino from 'pino';

import { createRedisConnection } from './redis.js';

import type { DefaultJobOptions } from 'bullmq';

import type {
  CurationQueueJobData,
  DeadLetterJobData,
  DefaultQueueJobData,
  EmbeddingsQueueJobData,
  SyncQueueJobData,
} from './types.js';

const logger = pino({ name: 'pops-jobs' });

// ---------------------------------------------------------------------------
// Queue name constants
// ---------------------------------------------------------------------------

export const SYNC_QUEUE = 'pops-sync';
export const EMBEDDINGS_QUEUE = 'pops-embeddings';
export const CURATION_QUEUE = 'pops-curation';
export const DEFAULT_QUEUE = 'pops-default';
export const DEAD_LETTER_QUEUE = 'pops-dead-letter';

export const ALL_QUEUES = [SYNC_QUEUE, EMBEDDINGS_QUEUE, CURATION_QUEUE, DEFAULT_QUEUE] as const;
export type QueueName = (typeof ALL_QUEUES)[number] | typeof DEAD_LETTER_QUEUE;

// ---------------------------------------------------------------------------
// Per-queue concurrency
// ---------------------------------------------------------------------------

export const QUEUE_CONCURRENCY: Record<string, number> = {
  [SYNC_QUEUE]: 1,
  [EMBEDDINGS_QUEUE]: 2,
  [CURATION_QUEUE]: 1,
  [DEFAULT_QUEUE]: 3,
};

// ---------------------------------------------------------------------------
// Default job options per queue
// ---------------------------------------------------------------------------

export const SYNC_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

export const EMBEDDINGS_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

export const CURATION_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

// ---------------------------------------------------------------------------
// Lazy queue singletons
// ---------------------------------------------------------------------------

let syncQueue: Queue<SyncQueueJobData> | null = null;
let embeddingsQueue: Queue<EmbeddingsQueueJobData> | null = null;
let curationQueue: Queue<CurationQueueJobData> | null = null;
let defaultQueue: Queue<DefaultQueueJobData> | null = null;
let deadLetterQueue: Queue<DeadLetterJobData> | null = null;

function warnNoRedis(queueName: string): null {
  logger.warn({ queue: queueName }, 'Redis unavailable — queue disabled (REDIS_HOST not set)');
  return null;
}

export function getSyncQueue(): Queue<SyncQueueJobData> | null {
  const connection = createRedisConnection();
  if (!connection) return warnNoRedis(SYNC_QUEUE);
  syncQueue ??= new Queue<SyncQueueJobData>(SYNC_QUEUE, {
    connection,
    defaultJobOptions: SYNC_JOB_OPTIONS,
  });
  return syncQueue;
}

export function getEmbeddingsQueue(): Queue<EmbeddingsQueueJobData> | null {
  const connection = createRedisConnection();
  if (!connection) return warnNoRedis(EMBEDDINGS_QUEUE);
  embeddingsQueue ??= new Queue<EmbeddingsQueueJobData>(EMBEDDINGS_QUEUE, {
    connection,
    defaultJobOptions: EMBEDDINGS_JOB_OPTIONS,
  });
  return embeddingsQueue;
}

export function getCurationQueue(): Queue<CurationQueueJobData> | null {
  const connection = createRedisConnection();
  if (!connection) return warnNoRedis(CURATION_QUEUE);
  curationQueue ??= new Queue<CurationQueueJobData>(CURATION_QUEUE, {
    connection,
    defaultJobOptions: CURATION_JOB_OPTIONS,
  });
  return curationQueue;
}

export function getDefaultQueue(): Queue<DefaultQueueJobData> | null {
  const connection = createRedisConnection();
  if (!connection) return warnNoRedis(DEFAULT_QUEUE);
  defaultQueue ??= new Queue<DefaultQueueJobData>(DEFAULT_QUEUE, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return defaultQueue;
}

export function getDeadLetterQueue(): Queue<DeadLetterJobData> | null {
  const connection = createRedisConnection();
  if (!connection) return warnNoRedis(DEAD_LETTER_QUEUE);
  deadLetterQueue ??= new Queue<DeadLetterJobData>(DEAD_LETTER_QUEUE, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail: false,
    },
  });
  return deadLetterQueue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    syncQueue?.close(),
    embeddingsQueue?.close(),
    curationQueue?.close(),
    defaultQueue?.close(),
    deadLetterQueue?.close(),
  ]);
  syncQueue = null;
  embeddingsQueue = null;
  curationQueue = null;
  defaultQueue = null;
  deadLetterQueue = null;
}

/** Return a queue instance by name — null for unknown names or when Redis is unavailable. */
export function getQueueByName(name: string): Queue | null {
  switch (name) {
    case SYNC_QUEUE:
      return getSyncQueue();
    case EMBEDDINGS_QUEUE:
      return getEmbeddingsQueue();
    case CURATION_QUEUE:
      return getCurationQueue();
    case DEFAULT_QUEUE:
      return getDefaultQueue();
    case DEAD_LETTER_QUEUE:
      return getDeadLetterQueue();
    default:
      return null;
  }
}
