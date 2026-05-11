import pino from 'pino';

import { getDrizzle } from '../../db.js';
import {
  CROSS_SOURCE_TYPES,
  CrossSourceIndexer,
} from '../../modules/cerebrum/thalamus/cross-source.js';
import { runEvaluation } from '../../modules/core/ai-alerts/evaluator.js';
import { runRetention } from '../../modules/core/ai-observability/retention.js';

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

  if (job.data.type === 'aiLogRetention') {
    const result = runRetention();
    logger.info(
      {
        rowsAggregated: result.rowsAggregated,
        bucketsWritten: result.bucketsWritten,
        batches: result.batches,
        cutoff: result.cutoff,
      },
      'AI inference log retention complete'
    );
    return result;
  }

  if (job.data.type === 'aiAlertEvaluation') {
    const result = await runEvaluation();
    logger.info(
      {
        rulesEvaluated: result.rulesEvaluated,
        candidates: result.candidates,
        deduped: result.deduped,
        fired: result.alerts.length,
      },
      'AI alert evaluation complete'
    );
    return result;
  }

  // Exhaustiveness guard — `data` is the discriminated union; if a new
  // member is added the compiler will surface a "not assignable to never"
  // error here so we know to extend the handler.
  const _exhaustive: never = job.data;
  throw new Error(`Default handler not implemented for data: ${JSON.stringify(_exhaustive)}`);
}
