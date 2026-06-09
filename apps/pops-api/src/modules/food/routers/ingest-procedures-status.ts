/**
 * PRD-125 — `food.ingest.status` and `food.ingest.list` implementations.
 *
 * Combine the BullMQ job state with the DB row state. The DB is
 * authoritative once the job has aged out of Redis (`removeOnComplete` /
 * `removeOnFail` retention windows). See `ingest-state.ts` for the
 * resolution rules.
 */
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';

import { type FoodDb, ingestSources, type IngestSourceRow } from '@pops/app-food-db';

import { getFoodIngestQueue } from '../queue.js';
import {
  deriveIngestState,
  extractPartialReason,
  type IngestState,
} from '../services/ingest-state.js';

import type { PartialReason } from '@pops/food-contracts';

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

/**
 * BullMQ has no native "get job by data.sourceId" — we scan the recent
 * window once and bucket by sourceId. Cheaper than O(rows × Redis round
 * trips) when `list` returns many rows. When PRD-126 lands a heavier
 * worker we can persist `jobId` on `ingest_sources` and skip the scan
 * altogether.
 */
async function fetchJobTimingsBatch(
  sourceIds: readonly number[]
): Promise<Map<number, JobTimings>> {
  const out = new Map<number, JobTimings>();
  if (sourceIds.length === 0) return out;
  const queue = getFoodIngestQueue();
  if (queue === null) return out;
  const wanted = new Set(sourceIds);
  const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 99);
  for (const job of jobs) {
    const data: unknown = job.data;
    if (typeof data !== 'object' || data === null) continue;
    const sourceId = (data as { sourceId?: number }).sourceId;
    if (typeof sourceId !== 'number' || !wanted.has(sourceId) || out.has(sourceId)) continue;
    const state = await job.getState();
    out.set(sourceId, {
      jobId: job.id ?? null,
      bullmqState: state,
      startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    });
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
