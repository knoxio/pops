/**
 * Rotation-cycle log persistence against the media pillar's SQLite.
 *
 * The api-layer rotation cycle owns the {@link RotationCycleLog} shape; this
 * service just serialises the per-movie detail lists to the `details` JSON
 * column and reads them back.
 */
import { count, desc, isNull, sql, sum } from 'drizzle-orm';

import { rotationLog } from '../../schema.js';

import type { MediaDb } from '../internal.js';

export type RotationLogRow = typeof rotationLog.$inferSelect;

/** Per-movie reference stored in the rotation log `details` column. */
export interface RotationMovieRef {
  tmdbId: number;
  title: string;
}

/** Per-movie reference for failed removals, which may carry an error message. */
export interface RotationFailedMovieRef extends RotationMovieRef {
  error?: string;
}

/** The cycle outcome the api layer hands to {@link writeCycleLog}. */
export interface RotationCycleLog {
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
  marked: RotationMovieRef[];
  removed: RotationMovieRef[];
  added: RotationMovieRef[];
  failed: RotationFailedMovieRef[];
}

export interface ListRotationLogResult {
  items: RotationLogRow[];
  total: number;
}

export interface RotationLogStats {
  totalRotated: number;
  avgPerDay: number;
  streak: number;
}

function encodeDetails(result: RotationCycleLog): string | null {
  const hasDetails =
    result.marked.length > 0 ||
    result.removed.length > 0 ||
    result.added.length > 0 ||
    result.failed.length > 0;
  if (!hasDetails) return null;
  return JSON.stringify({
    marked: result.marked,
    removed: result.removed,
    added: result.added,
    failed: result.failed,
  });
}

/** Persist one rotation-cycle outcome as a `rotation_log` row. */
export function writeCycleLog(db: MediaDb, result: RotationCycleLog): void {
  db.insert(rotationLog)
    .values({
      executedAt: new Date().toISOString(),
      moviesMarkedLeaving: result.moviesMarkedLeaving,
      moviesRemoved: result.moviesRemoved,
      moviesAdded: result.moviesAdded,
      removalsFailed: result.removalsFailed,
      freeSpaceGb: result.freeSpaceGb,
      targetFreeGb: result.targetFreeGb,
      skippedReason: result.skippedReason,
      details: encodeDetails(result),
    })
    .run();
}

/** The most recent cycle-log row, or `null` when no cycle has run. */
export function lastCycleLog(db: MediaDb): RotationLogRow | null {
  return db.select().from(rotationLog).orderBy(desc(rotationLog.id)).limit(1).get() ?? null;
}

/** Paginated cycle-log rows, newest first. */
export function listRotationLog(db: MediaDb, limit: number, offset: number): ListRotationLogResult {
  const items = db
    .select()
    .from(rotationLog)
    .orderBy(desc(rotationLog.executedAt))
    .limit(limit)
    .offset(offset)
    .all();
  const countRow = db.select({ total: count() }).from(rotationLog).get();
  return { items, total: countRow?.total ?? 0 };
}

function computeAvgPerDay(
  totalRotated: number,
  minDate: string | null,
  maxDate: string | null
): number {
  if (!minDate || !maxDate) return 0;
  const days = Math.max(
    1,
    (new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.round((totalRotated / days) * 10) / 10;
}

function computeStreak(db: MediaDb): number {
  const rows = db
    .select({ skippedReason: rotationLog.skippedReason })
    .from(rotationLog)
    .orderBy(desc(rotationLog.executedAt))
    .all();
  let streak = 0;
  for (const row of rows) {
    if (row.skippedReason) break;
    streak++;
  }
  return streak;
}

/** Summary statistics for the rotation log page. */
export function getRotationLogStats(db: MediaDb): RotationLogStats {
  const totals = db
    .select({
      totalRemoved: sum(rotationLog.moviesRemoved),
      totalAdded: sum(rotationLog.moviesAdded),
    })
    .from(rotationLog)
    .where(isNull(rotationLog.skippedReason))
    .get();
  const totalRotated = (Number(totals?.totalRemoved) || 0) + (Number(totals?.totalAdded) || 0);

  const range = db
    .select({
      minDate: sql<string | null>`MIN(${rotationLog.executedAt})`,
      maxDate: sql<string | null>`MAX(${rotationLog.executedAt})`,
    })
    .from(rotationLog)
    .where(isNull(rotationLog.skippedReason))
    .get();

  return {
    totalRotated,
    avgPerDay: computeAvgPerDay(totalRotated, range?.minDate ?? null, range?.maxDate ?? null),
    streak: computeStreak(db),
  };
}
