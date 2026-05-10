/**
 * Inference log retention + daily aggregation (PRD-092 US-08).
 *
 * Pure-ish service module:
 *  - `aggregateRowsToDaily` is a pure function over input rows used by the
 *    unit tests.
 *  - `runRetention` performs the full cycle (read → aggregate → upsert →
 *    delete) against `getDb()`.
 *
 * The job is idempotent: a re-run with no aged-out rows returns zero
 * deletions, and re-running over the same horizon adds to existing daily
 * rows via the unique-key-aware upsert (it does not double-count because
 * the source rows have already been deleted by the previous run).
 */
import { getDb } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import { getSettingValue } from '../settings/service.js';
import { deleteRowsByIds, fetchAgedBatch, upsertAggregate } from './retention-db.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { DailyAggregate, RetentionInputRow, RetentionResult } from './retention-types.js';

export type {
  DailyAggregate,
  DailyAggregateKey,
  RetentionInputRow,
  RetentionResult,
} from './retention-types.js';

export const DEFAULT_RETENTION_DAYS = 90;
export const RETENTION_BATCH_SIZE = 10_000;
export const RETENTION_SETTING_KEY = 'ai.logRetentionDays';

/** Returns the configured retention horizon in days. */
export function getRetentionDays(): number {
  return getSettingValue(RETENTION_SETTING_KEY, DEFAULT_RETENTION_DAYS);
}

interface BucketAccumulator extends DailyAggregate {
  latencySum: number;
  latencyCount: number;
}

function newBucket(row: RetentionInputRow, date: string): BucketAccumulator {
  return {
    date,
    provider: row.provider,
    model: row.model,
    operation: row.operation,
    domain: row.domain,
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    avgLatencyMs: 0,
    errorCount: 0,
    timeoutCount: 0,
    cacheHitCount: 0,
    budgetBlockedCount: 0,
    latencySum: 0,
    latencyCount: 0,
  };
}

function applyRow(bucket: BucketAccumulator, row: RetentionInputRow): void {
  bucket.totalCalls += 1;
  bucket.totalInputTokens += row.inputTokens;
  bucket.totalOutputTokens += row.outputTokens;
  bucket.totalCostUsd += row.costUsd;

  if (row.cached === 1) bucket.cacheHitCount += 1;
  if (row.status === 'error') bucket.errorCount += 1;
  else if (row.status === 'timeout') bucket.timeoutCount += 1;
  else if (row.status === 'budget-blocked') bucket.budgetBlockedCount += 1;

  if (row.status === 'success' && row.cached === 0 && row.latencyMs > 0) {
    bucket.latencySum += row.latencyMs;
    bucket.latencyCount += 1;
  }
}

function finalizeBucket(b: BucketAccumulator): DailyAggregate {
  return {
    date: b.date,
    provider: b.provider,
    model: b.model,
    operation: b.operation,
    domain: b.domain,
    totalCalls: b.totalCalls,
    totalInputTokens: b.totalInputTokens,
    totalOutputTokens: b.totalOutputTokens,
    totalCostUsd: b.totalCostUsd,
    avgLatencyMs: b.latencyCount > 0 ? Math.round(b.latencySum / b.latencyCount) : 0,
    errorCount: b.errorCount,
    timeoutCount: b.timeoutCount,
    cacheHitCount: b.cacheHitCount,
    budgetBlockedCount: b.budgetBlockedCount,
  };
}

/**
 * Pure aggregator: turns a flat list of `ai_inference_log` rows into one
 * `DailyAggregate` per `(date, provider, model, operation, domain)` tuple.
 *
 * - `date` is the UTC `YYYY-MM-DD` slice of `createdAt`
 * - `avgLatencyMs` is computed only over `success` non-cached rows whose
 *   latency is > 0 (matches the same filter the dashboard's percentile
 *   calculation uses), and rounds to the nearest integer to fit the
 *   integer column. Buckets with no qualifying rows have `avgLatencyMs = 0`.
 * - status counts (`error`, `timeout`, `budget-blocked`) are mutually
 *   exclusive — each row contributes to at most one of them.
 */
export function aggregateRowsToDaily(rows: RetentionInputRow[]): DailyAggregate[] {
  const buckets = new Map<string, BucketAccumulator>();

  for (const row of rows) {
    const date = row.createdAt.slice(0, 10);
    const key = JSON.stringify([date, row.provider, row.model, row.operation, row.domain ?? '']);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = newBucket(row, date);
      buckets.set(key, bucket);
    }
    applyRow(bucket, row);
  }

  return Array.from(buckets.values()).map(finalizeBucket);
}

/** Compute the cutoff date string used to compare `created_at` lexicographically. */
export function computeCutoff(retentionDays: number, now: Date = new Date()): string {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

export interface RunRetentionOptions {
  /** Override the configured retention window (used by tests). */
  retentionDays?: number;
  /** Override the batch size (used by tests). */
  batchSize?: number;
  /** Override "now" — used by tests to pin the cutoff. */
  now?: Date;
  /** Database handle. Defaults to `getDb()`. */
  db?: BetterSqlite3.Database;
}

/**
 * Roll up and prune `ai_inference_log` rows older than the retention horizon.
 *
 * Each batch runs in its own transaction: aggregation upsert + delete are
 * atomic per-batch. If a batch fails partway, only that batch rolls back;
 * the next invocation re-processes it.
 */
export function runRetention(opts: RunRetentionOptions = {}): RetentionResult {
  const db = opts.db ?? getDb();
  const retentionDays = opts.retentionDays ?? getRetentionDays();
  const batchSize = opts.batchSize ?? RETENTION_BATCH_SIZE;
  const cutoff = computeCutoff(retentionDays, opts.now);

  let rowsAggregated = 0;
  let bucketsWritten = 0;
  let batches = 0;

  while (true) {
    const batch = fetchAgedBatch(db, cutoff, batchSize);
    if (batch.length === 0) break;

    batches += 1;

    const aggregates = aggregateRowsToDaily(batch.map((b) => b.row));
    const ids = batch.map((b) => b.id);

    const tx = db.transaction(() => {
      for (const agg of aggregates) upsertAggregate(db, agg);
      deleteRowsByIds(db, ids);
    });
    tx();

    rowsAggregated += batch.length;
    bucketsWritten += aggregates.length;

    if (batch.length < batchSize) break;
  }

  logger.info(
    { rowsAggregated, bucketsWritten, batches, cutoff, retentionDays },
    '[ai-retention] Inference log retention pass complete'
  );

  return { rowsAggregated, bucketsWritten, batches, cutoff };
}
