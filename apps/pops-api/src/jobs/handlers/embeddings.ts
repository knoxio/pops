import pino from 'pino';

import type { Job } from 'bullmq';

import type { EmbeddingsQueueJobData } from '../types.js';

const logger = pino({ name: 'worker:embeddings' });

export async function process(job: Job<EmbeddingsQueueJobData>): Promise<unknown> {
  logger.info({ jobId: job.id, type: job.data.type }, 'Embeddings job received');
  throw new Error(`Embeddings handler not implemented for type: ${job.data.type}`);
}
