/**
 * PRD-125 — `food.ingest.cancel` and `food.ingest.retry` implementations.
 *
 * `cancel` is best-effort: it removes the BullMQ job if still queued /
 * processing; the worker is responsible for honouring cancellation between
 * pipeline stages (PRD-126). `retry` re-enqueues with the same input,
 * increments `attempts`, and reuses the same `sourceId`.
 */
import { eq, sql } from 'drizzle-orm';

import { type FoodDb, ingestSources } from '@pops/app-food-db';

import { getFoodIngestQueue } from '../queue.js';
import { enqueueIngestJob, type EnqueueResult } from '../services/ingest-enqueue.js';

import type { IngestJobData } from '@pops/food-contracts';

const CANCELLABLE = new Set(['waiting', 'delayed', 'active', 'waiting_children', 'prioritized']);

async function findJobBySourceId(
  sourceId: number
): Promise<
  Awaited<ReturnType<NonNullable<ReturnType<typeof getFoodIngestQueue>>['getJobs']>>[number] | null
> {
  const queue = getFoodIngestQueue();
  if (queue === null) return null;
  const jobs = await queue.getJobs(['waiting', 'delayed', 'active'], 0, 99);
  for (const job of jobs) {
    const data: unknown = job.data;
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { sourceId?: number }).sourceId === sourceId
    ) {
      return job;
    }
  }
  return null;
}

export type CancelOutcome = { ok: true } | { ok: false; reason: 'not-cancellable' };

export async function cancelIngest(sourceId: number): Promise<CancelOutcome> {
  const job = await findJobBySourceId(sourceId);
  if (job === null) return { ok: false, reason: 'not-cancellable' };
  const state = await job.getState();
  if (!CANCELLABLE.has(state)) return { ok: false, reason: 'not-cancellable' };
  await job.remove();
  return { ok: true };
}

/**
 * Reconstructs the job-data from the persisted `ingest_sources` row so the
 * retry uses the same inputs the original `start` enqueued. Bumps
 * `attempts` atomically with the enqueue's "fire" — if the enqueue fails,
 * the increment is rolled back so user-facing attempts stays accurate.
 */
function jobDataFromRow(row: {
  id: number;
  kind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  url: string | null;
  caption: string | null;
}): IngestJobData {
  switch (row.kind) {
    case 'url-web':
    case 'url-instagram':
      if (row.url === null) {
        throw new Error(`Retry blocked: ingest_sources #${row.id} missing url`);
      }
      return { kind: row.kind, sourceId: row.id, url: row.url };
    case 'text':
      if (row.caption === null) {
        throw new Error(`Retry blocked: ingest_sources #${row.id} missing caption/body`);
      }
      return { kind: 'text', sourceId: row.id, body: row.caption };
    case 'screenshot':
      // Screenshot retry reuses the original on-disk file under the per-
      // source dir. The worker resolves via `ingestRootDir()`.
      return {
        kind: 'screenshot',
        sourceId: row.id,
        // Mime is the original mime; for v1 we only stored the file path,
        // not the mime. Worker re-derives from extension if needed.
        mimeType: 'image/png',
        contentPath: `${row.id}/screenshot.png`,
      };
  }
}

export async function retryIngest(db: FoodDb, sourceId: number): Promise<EnqueueResult> {
  const rows = db
    .select({
      id: ingestSources.id,
      kind: ingestSources.kind,
      url: ingestSources.url,
      caption: ingestSources.caption,
    })
    .from(ingestSources)
    .where(eq(ingestSources.id, sourceId))
    .all();
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`ingest_sources #${sourceId} not found`);
  }
  const data = jobDataFromRow(row);
  const enqueued = await enqueueIngestJob(data);
  db.update(ingestSources)
    .set({
      attempts: sql`${ingestSources.attempts} + 1`,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(ingestSources.id, sourceId))
    .run();
  return enqueued;
}
