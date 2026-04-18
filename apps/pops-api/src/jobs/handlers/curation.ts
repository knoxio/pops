import pino from 'pino';

import type { Job } from 'bullmq';

import type { CurationQueueJobData } from '../types.js';

const logger = pino({ name: 'worker:curation' });

export async function process(job: Job<CurationQueueJobData>): Promise<unknown> {
  logger.info({ jobId: job.id, type: job.data.type }, 'Curation job received');
  throw new Error(`Curation handler not implemented for type: ${job.data.type}`);
}
