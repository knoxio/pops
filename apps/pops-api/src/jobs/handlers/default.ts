import pino from 'pino';

import type { Job } from 'bullmq';

import type { DefaultQueueJobData } from '../types.js';

const logger = pino({ name: 'worker:default' });

export async function process(job: Job<DefaultQueueJobData>): Promise<unknown> {
  logger.info({ jobId: job.id, type: job.data.type }, 'Default job received');
  throw new Error(`Default handler not implemented for type: ${job.data.type}`);
}
