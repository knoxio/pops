import pino from 'pino';

import { getDrizzle } from '../../db.js';
import {
  CROSS_SOURCE_TYPES,
  CrossSourceIndexer,
} from '../../modules/cerebrum/thalamus/cross-source.js';

import type { Job } from 'bullmq';

import type { DefaultQueueJobData } from '../types.js';

const logger = pino({ name: 'worker:default' });

export async function process(job: Job<DefaultQueueJobData>): Promise<unknown> {
  logger.info({ jobId: job.id, type: job.data.type }, 'Default job received');

  if (job.data.type === 'crossSourceIndex') {
    const db = getDrizzle();
    const indexer = new CrossSourceIndexer(db);
    const validTypes = (job.data.sourceTypes ?? [...CROSS_SOURCE_TYPES]).filter(
      (t): t is (typeof CROSS_SOURCE_TYPES)[number] =>
        (CROSS_SOURCE_TYPES as readonly string[]).includes(t)
    );
    const result = await indexer.scanAndEnqueue(validTypes);
    logger.info({ enqueued: result.enqueued }, 'Cross-source index scan complete');
    return result;
  }

  throw new Error(`Default handler not implemented for type: ${job.data.type}`);
}
