/**
 * Thin nudge_log read/dismiss service for the cerebrum-api container.
 *
 * Phase 5 PR 1 (Track M5) moves the read-only + dismiss surface of the
 * nudges router into cerebrum-api — the procedures that touch ONLY the
 * `nudge_log` table and therefore depend on nothing outside
 * `@pops/cerebrum-db`.
 *
 * The cross-pillar procedures (`scan`, `act`, `configure`) stay in
 * pops-api for now because they pull in detectors, the HybridSearchService,
 * the EngramService and a module-level thresholds object that hasn't
 * migrated yet. They follow once the engrams + retrieval slices move.
 */
import { and, count, eq, sql } from 'drizzle-orm';

import {
  type CerebrumDb,
  type Nudge,
  nudgeLog,
  nudgeLogService,
  rowToNudge,
} from '@pops/cerebrum-db';

import type { NudgePriority, NudgeStatus, NudgeType } from '@pops/cerebrum-db';

export interface ListNudgesOptions {
  type?: NudgeType;
  status?: NudgeStatus;
  priority?: NudgePriority;
  limit?: number;
  offset?: number;
}

export interface ListContradictionsOptions {
  status?: NudgeStatus | null;
  limit?: number;
  offset?: number;
}

export interface NudgeReadService {
  list(opts: ListNudgesOptions): { nudges: Nudge[]; total: number };
  get(id: string): Nudge | null;
  dismiss(id: string): { success: boolean };
  listContradictions(opts: ListContradictionsOptions): { nudges: Nudge[]; total: number };
}

export function createNudgeReadService(db: CerebrumDb): NudgeReadService {
  return {
    list(opts: ListNudgesOptions): { nudges: Nudge[]; total: number } {
      const conditions = [];
      if (opts.type) conditions.push(eq(nudgeLog.type, opts.type));
      if (opts.status) conditions.push(eq(nudgeLog.status, opts.status));
      if (opts.priority) conditions.push(eq(nudgeLog.priority, opts.priority));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const limit = opts.limit ?? 50;
      const offset = opts.offset ?? 0;

      const baseQuery = db.select().from(nudgeLog);
      const rows = (where ? baseQuery.where(where) : baseQuery)
        .orderBy(sql`${nudgeLog.createdAt} desc`)
        .limit(limit)
        .offset(offset)
        .all();

      const countQuery = db.select({ total: count() }).from(nudgeLog);
      const [totalRow] = (where ? countQuery.where(where) : countQuery).all();

      return {
        nudges: rows.map((r) => rowToNudge(r)),
        total: totalRow?.total ?? 0,
      };
    },

    get(id: string): Nudge | null {
      const [row] = db.select().from(nudgeLog).where(eq(nudgeLog.id, id)).all();
      return row ? rowToNudge(row) : null;
    },

    dismiss(id: string): { success: boolean } {
      const result = db
        .update(nudgeLog)
        .set({ status: 'dismissed' })
        .where(and(eq(nudgeLog.id, id), eq(nudgeLog.status, 'pending')))
        .run();
      return { success: result.changes > 0 };
    },

    listContradictions(opts: ListContradictionsOptions): { nudges: Nudge[]; total: number } {
      return nudgeLogService.listContradictions(db, opts);
    },
  };
}
