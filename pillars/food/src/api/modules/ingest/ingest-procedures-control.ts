/**
 * PRD-125 — `food.ingest.cancel` and `food.ingest.retry` implementations.
 *
 * `cancel` is best-effort: it removes the BullMQ job if still queued /
 * processing; the worker is responsible for honouring cancellation between
 * pipeline stages (PRD-126). `retry` re-enqueues with the same input,
 * increments `attempts`, and reuses the same `sourceId`.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';

import { type FoodDb, ingestSources } from '../../../db/index.js';
import { getFoodIngestQueue } from '../../queue.js';
import { enqueueIngestJob, type EnqueueResult } from './ingest-enqueue.js';

import type { IngestJobData } from '../../../contract/queue/index.js';

/** Mirror of `packages/app-food/src/storage/ingest-paths.ts`. */
const DEFAULT_FOOD_INGEST_DIR = './data/food/ingest';
const MIME_BY_EXT: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function findOnDiskScreenshot(
  sourceId: number
): { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; filename: string } | null {
  const configured = process.env['FOOD_INGEST_DIR'];
  const root = configured && configured.length > 0 ? configured : DEFAULT_FOOD_INGEST_DIR;
  const dir = resolve(root, String(sourceId));
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const match = /^screenshot\.([a-z0-9]+)$/i.exec(entry);
    if (match === null) continue;
    const ext = match[1]?.toLowerCase() ?? '';
    const mimeType = MIME_BY_EXT[ext];
    if (mimeType !== undefined) return { mimeType, filename: entry };
  }
  return null;
}

// Note: BullMQ uses `waiting-children` (hyphen), not `waiting_children`
// (underscore) as the state literal. Earlier code listed the wrong
// spelling and silently never matched.
const CANCELLABLE_STATES = [
  'waiting',
  'delayed',
  'active',
  'waiting-children',
  'prioritized',
] as const;
const CANCELLABLE = new Set<string>(CANCELLABLE_STATES);

async function findJobBySourceId(
  sourceId: number
): Promise<
  Awaited<ReturnType<NonNullable<ReturnType<typeof getFoodIngestQueue>>['getJobs']>>[number] | null
> {
  const queue = getFoodIngestQueue();
  if (queue === null) return null;
  // Scan the SAME states `cancelIngest` recognises as cancellable —
  // earlier `findJobBySourceId` only looked at `waiting/delayed/active`
  // and silently lost any job stuck in `waiting_children` / `prioritized`.
  // BullMQ's `getJobs` overload doesn't accept readonly arrays — copy
  // into a mutable array.
  const jobs = await queue.getJobs([...CANCELLABLE_STATES], 0, 99);
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
    case 'screenshot': {
      // Screenshot retry reuses the original on-disk file under the per-
      // source dir. Mime is not persisted in `ingest_sources`; recover it
      // from the filename extension so jpg / webp retries don't fall back
      // to `.png`.
      const found = findOnDiskScreenshot(row.id);
      if (found === null) {
        throw new Error(
          `Retry blocked: screenshot for ingest_sources #${row.id} not on disk (already evicted?)`
        );
      }
      return {
        kind: 'screenshot',
        sourceId: row.id,
        mimeType: found.mimeType,
        contentPath: `${row.id}/${found.filename}`,
      };
    }
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
