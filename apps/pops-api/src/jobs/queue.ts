import { Queue } from 'bullmq';

import { getRedis, isRedisAvailable } from '../shared/redis-client.js';
import { EMBEDDINGS_QUEUE } from './queues.js';

import type { EmbedJobData } from './handlers/embeddings.js';

let _embeddingsQueue: Queue<EmbedJobData> | null = null;

/** Get the embeddings queue, or null if Redis is not available. */
export function getEmbeddingsQueue(): Queue<EmbedJobData> | null {
  const redis = getRedis();
  if (!redis || !isRedisAvailable()) return null;

  _embeddingsQueue ??= new Queue<EmbedJobData>(EMBEDDINGS_QUEUE, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  return _embeddingsQueue;
}

export async function closeQueues(): Promise<void> {
  if (_embeddingsQueue) {
    await _embeddingsQueue.close();
    _embeddingsQueue = null;
  }
}
