import { Queue } from 'bullmq';

import { createRedisConnection } from './redis.js';

import type { DefaultJobOptions } from 'bullmq';

import type {
  CurationQueueJobData,
  DeadLetterJobData,
  DefaultQueueJobData,
  EmbeddingsQueueJobData,
  SyncQueueJobData,
} from './types.js';

// ---------------------------------------------------------------------------
// Queue name constants
// ---------------------------------------------------------------------------

export const SYNC_QUEUE = 'pops:sync';
export const EMBEDDINGS_QUEUE = 'pops:embeddings';
export const CURATION_QUEUE = 'pops:curation';
export const DEFAULT_QUEUE = 'pops:default';
export const DEAD_LETTER_QUEUE = 'pops:dead-letter';

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

let _syncQueue: Queue<SyncQueueJobData> | null = null;
let _embeddingsQueue: Queue<EmbeddingsQueueJobData> | null = null;
let _curationQueue: Queue<CurationQueueJobData> | null = null;
let _defaultQueue: Queue<DefaultQueueJobData> | null = null;
let _deadLetterQueue: Queue<DeadLetterJobData> | null = null;

export function getSyncQueue(): Queue<SyncQueueJobData> {
  if (!_syncQueue) {
    _syncQueue = new Queue<SyncQueueJobData>(SYNC_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: SYNC_JOB_OPTIONS,
    });
  }
  return _syncQueue;
}

export function getEmbeddingsQueue(): Queue<EmbeddingsQueueJobData> {
  if (!_embeddingsQueue) {
    _embeddingsQueue = new Queue<EmbeddingsQueueJobData>(EMBEDDINGS_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: EMBEDDINGS_JOB_OPTIONS,
    });
  }
  return _embeddingsQueue;
}

export function getCurationQueue(): Queue<CurationQueueJobData> {
  if (!_curationQueue) {
    _curationQueue = new Queue<CurationQueueJobData>(CURATION_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: CURATION_JOB_OPTIONS,
    });
  }
  return _curationQueue;
}

export function getDefaultQueue(): Queue<DefaultQueueJobData> {
  if (!_defaultQueue) {
    _defaultQueue = new Queue<DefaultQueueJobData>(DEFAULT_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _defaultQueue;
}

export function getDeadLetterQueue(): Queue<DeadLetterJobData> {
  if (!_deadLetterQueue) {
    _deadLetterQueue = new Queue<DeadLetterJobData>(DEAD_LETTER_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
    });
  }
  return _deadLetterQueue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    _syncQueue?.close(),
    _embeddingsQueue?.close(),
    _curationQueue?.close(),
    _defaultQueue?.close(),
    _deadLetterQueue?.close(),
  ]);
  _syncQueue = null;
  _embeddingsQueue = null;
  _curationQueue = null;
  _defaultQueue = null;
  _deadLetterQueue = null;
}

/** Return a queue instance by name — null for unknown names. */
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
