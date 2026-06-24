/**
 * `status` and `list` implementations for the ingest routes.
 *
 * Combine the BullMQ job state with the DB row state. The DB is
 * authoritative once the job has aged out of Redis (`removeOnComplete` /
 * `removeOnFail` retention windows). See `ingest-state.ts` for the
 * resolution rules.
 */
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';

import { type FoodDb, ingestSources, type IngestSourceRow } from '../../../db/index.js';
import { getFoodIngestQueue } from '../../queue.js';
import { deriveIngestState, extractPartialReason, type IngestState } from './ingest-state.js';

import type { PartialReason } from '../../../contract/queue/index.js';

export interface IngestStatusView {
  sourceId: number;
  kind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  state: IngestState;
  jobId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  draftRecipeId: number | null;
  partialReason?: PartialReason;
  errorCode?: string;
  errorMessage?: string;
  attempts: number;
}

interface JobTimings {
  jobId: string | null;
  bullmqState: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

const EMPTY_TIMINGS: JobTimings = {
  jobId: null,
  bullmqState: null,
  startedAt: null,
  completedAt: null,
};

/**
 * Fetch BullMQ timings for ONE source id. Used by `status`. The `list`
 * endpoint uses `fetchJobTimingsBatch` below to scan jobs once per request
 * and build a sourceId → timings map.
 */
async function fetchJobTimings(sourceId: number): Promise<JobTimings> {
  const map = await fetchJobTimingsBatch([sourceId]);
  return map.get(sourceId) ?? EMPTY_TIMINGS;
}

/** BullMQ pagination chunk size — keep individual Redis round-trips small. */
const SCAN_PAGE_SIZE = 100;
/** Maximum jobs we'll walk per request. Mirrors the queue's
 *  `removeOnComplete: { count: 1_000 }` retention so the scan can find
 *  any job still tracked by Redis. Beyond this the DB row's state is
 *  authoritative anyway (set by `workerComplete`). */
const SCAN_MAX_JOBS = 1_000;

/**
 * BullMQ has no native "get job by data.sourceId" — we paginate the
 * recent window and bucket by sourceId, stopping early once every
 * requested id has been resolved. Cheaper than O(rows × Redis round
 * trips) when `list` returns many rows.
 */
type BullMQJob = Awaited<
  ReturnType<NonNullable<ReturnType<typeof getFoodIngestQueue>>['getJobs']>
>[number];

async function recordJobTimings(
  job: BullMQJob,
  wanted: ReadonlySet<number>,
  out: Map<number, JobTimings>
): Promise<void> {
  const data: unknown = job.data;
  if (typeof data !== 'object' || data === null) return;
  const sourceId = (data as { sourceId?: number }).sourceId;
  if (typeof sourceId !== 'number' || !wanted.has(sourceId) || out.has(sourceId)) return;
  const state = await job.getState();
  out.set(sourceId, {
    jobId: job.id ?? null,
    bullmqState: state,
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  });
}

async function fetchJobTimingsBatch(
  sourceIds: readonly number[]
): Promise<Map<number, JobTimings>> {
  const out = new Map<number, JobTimings>();
  if (sourceIds.length === 0) return out;
  const queue = getFoodIngestQueue();
  if (queue === null) return out;
  const wanted = new Set(sourceIds);
  for (let offset = 0; offset < SCAN_MAX_JOBS; offset += SCAN_PAGE_SIZE) {
    if (out.size === wanted.size) break;
    const end = offset + SCAN_PAGE_SIZE - 1;
    const jobs = await queue.getJobs(
      ['waiting', 'delayed', 'active', 'completed', 'failed'],
      offset,
      end
    );
    if (jobs.length === 0) break;
    for (const job of jobs) {
      await recordJobTimings(job, wanted, out);
    }
    if (jobs.length < SCAN_PAGE_SIZE) break; // exhausted the window
  }
  return out;
}

function rowToView(row: IngestSourceRow, timings: JobTimings): IngestStatusView {
  const partialReason = extractPartialReason(row.extractedJson);
  return {
    sourceId: row.id,
    kind: row.kind,
    state: deriveIngestState(row, timings.bullmqState, partialReason),
    jobId: timings.jobId,
    startedAt: timings.startedAt,
    completedAt: timings.completedAt,
    draftRecipeId: row.draftRecipeId,
    partialReason,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    attempts: row.attempts,
  };
}

export async function getIngestStatus(
  db: FoodDb,
  sourceId: number
): Promise<IngestStatusView | null> {
  const rows = db.select().from(ingestSources).where(eq(ingestSources.id, sourceId)).all();
  const row = rows[0];
  if (row === undefined) return null;
  const timings = await fetchJobTimings(sourceId);
  return rowToView(row, timings);
}

export interface ListResult {
  items: IngestStatusView[];
  nextCursor?: string;
}

export async function listIngestSources(
  db: FoodDb,
  filter: { state?: IngestState; cursor?: string; limit: number }
): Promise<ListResult> {
  const conditions: SQL[] = [];
  if (filter.cursor !== undefined) {
    const cursorId = Number(filter.cursor);
    if (Number.isFinite(cursorId)) conditions.push(lt(ingestSources.id, cursorId));
  }
  const where = conditions.length === 0 ? undefined : and(...conditions);
  // Fetch limit + 1 to detect more-pages without a count(*) round trip.
  const rows = db
    .select()
    .from(ingestSources)
    .where(where)
    .orderBy(desc(ingestSources.id))
    .limit(filter.limit + 1)
    .all();
  const hasMore = rows.length > filter.limit;
  const sliced = hasMore ? rows.slice(0, filter.limit) : rows;
  // Batch the BullMQ scan — one round trip for the whole page, not one
  // per row. See `fetchJobTimingsBatch` above for the contract.
  const timingsBySourceId = await fetchJobTimingsBatch(sliced.map((row) => row.id));
  const views: IngestStatusView[] = sliced.map((row) =>
    rowToView(row, timingsBySourceId.get(row.id) ?? EMPTY_TIMINGS)
  );
  const filtered =
    filter.state === undefined ? views : views.filter((v) => v.state === filter.state);
  const nextCursor = hasMore ? String(sliced[sliced.length - 1]?.id ?? '') : undefined;
  return { items: filtered, nextCursor };
}
