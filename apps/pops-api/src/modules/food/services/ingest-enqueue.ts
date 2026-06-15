/**
 * PRD-125 — `food.ingest.start` + `food.ingest.retry` enqueue helper.
 *
 * Encapsulates the BullMQ `add` call and the per-kind job-data shaping so
 * the router stays thin. The screenshot path is written to disk by
 * `writeScreenshotPayload` before this helper runs; this helper only takes
 * the resulting `contentPath`.
 */
import { type IngestJobData, FOOD_INGEST_QUEUE_NAME } from '@pops/food/queue';

import { getFoodIngestQueue } from '../queue.js';

export class IngestQueueUnavailable extends Error {
  constructor() {
    super('food.ingest queue is unavailable (Redis not configured)');
    this.name = 'IngestQueueUnavailable';
  }
}

export interface EnqueueResult {
  jobId: string;
  queuedAt: string;
}

/**
 * `name` is the BullMQ "job name" — set to the kind so the worker can
 * pre-route via a `name` filter if it wants to. Job data lives in Redis;
 * for `screenshot` the heavy payload was already written to disk before
 * this call.
 */
export async function enqueueIngestJob(data: IngestJobData): Promise<EnqueueResult> {
  const queue = getFoodIngestQueue();
  if (queue === null) {
    throw new IngestQueueUnavailable();
  }
  const job = await queue.add(data.kind, data);
  const jobId = job.id;
  if (jobId === undefined) {
    throw new Error(`BullMQ ${FOOD_INGEST_QUEUE_NAME} returned a job with no id`);
  }
  return { jobId, queuedAt: new Date().toISOString() };
}
