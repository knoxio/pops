/**
 * Glia shared helpers — serialization, ID generation, and query builders.
 *
 * Extracted from action-service.ts to keep files under the max-lines limit.
 */
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';

import { gliaActions, gliaTrustState } from '@pops/db-types/schema';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type {
  ActionListFilters,
  ActionType,
  GliaAction,
  GliaTrustState,
  TrustPhase,
  UserDecision,
} from './types.js';

/** Serialise a row from glia_actions into a GliaAction. */
export function toGliaAction(row: typeof gliaActions.$inferSelect): GliaAction {
  return {
    id: row.id,
    actionType: row.actionType as ActionType,
    affectedIds: JSON.parse(row.affectedIds) as string[],
    rationale: row.rationale,
    payload: row.payload ? (JSON.parse(row.payload) as unknown) : null,
    phase: row.phase as TrustPhase,
    status: row.status as GliaAction['status'],
    userDecision: row.userDecision as UserDecision | null,
    userNote: row.userNote,
    executedAt: row.executedAt,
    decidedAt: row.decidedAt,
    revertedAt: row.revertedAt,
    createdAt: row.createdAt,
  };
}

/** Serialise a row from glia_trust_state into a GliaTrustState. */
export function toTrustState(row: typeof gliaTrustState.$inferSelect): GliaTrustState {
  return {
    actionType: row.actionType as ActionType,
    currentPhase: row.currentPhase as TrustPhase,
    approvedCount: row.approvedCount,
    rejectedCount: row.rejectedCount,
    revertedCount: row.revertedCount,
    autonomousSince: row.autonomousSince,
    lastRevertAt: row.lastRevertAt,
    graduatedAt: row.graduatedAt,
    updatedAt: row.updatedAt,
  };
}

/** Generate a unique action ID. */
export function generateActionId(actionType: ActionType, timestamp: string): string {
  const hash = Math.random().toString(36).substring(2, 10);
  const ts = timestamp.replace(/[^0-9]/g, '').substring(0, 14);
  return `glia_${actionType}_${ts}_${hash}`;
}

/** Get a single action by ID. */
export function getActionById(db: BetterSQLite3Database, id: string): GliaAction | null {
  const row = db.select().from(gliaActions).where(eq(gliaActions.id, id)).get();
  return row ? toGliaAction(row) : null;
}

/** List actions with optional filters. */
export function queryActions(
  db: BetterSQLite3Database,
  filters: ActionListFilters = {}
): { actions: GliaAction[]; total: number } {
  const conditions = [];
  if (filters.actionType) {
    conditions.push(eq(gliaActions.actionType, filters.actionType));
  }
  if (filters.status) {
    conditions.push(eq(gliaActions.status, filters.status));
  }
  if (filters.dateFrom) {
    conditions.push(gte(gliaActions.createdAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(gliaActions.createdAt, filters.dateTo));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(gliaActions)
    .where(whereClause)
    .get();
  const total = totalResult?.count ?? 0;

  const rows = db
    .select()
    .from(gliaActions)
    .where(whereClause)
    .orderBy(desc(gliaActions.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0)
    .all();

  return { actions: rows.map(toGliaAction), total };
}

/** Get trust state for a single action type. */
export function getTrustStateByType(
  db: BetterSQLite3Database,
  actionType: ActionType
): GliaTrustState | null {
  const row = db
    .select()
    .from(gliaTrustState)
    .where(eq(gliaTrustState.actionType, actionType))
    .get();
  return row ? toTrustState(row) : null;
}

/** List all trust states. */
export function listAllTrustStates(db: BetterSQLite3Database): GliaTrustState[] {
  return db.select().from(gliaTrustState).all().map(toTrustState);
}

/**
 * Query autonomous actions executed in a window.
 *
 * Autonomous = `status='executed'` AND `decided_at IS NULL` (workers acted
 * without user approval). Window is matched against `executed_at` because
 * created_at could be earlier than execution for delayed worker runs.
 *
 * The end bound is exclusive (`executedAt < endDate`) so a row pinned on the
 * boundary cannot appear in two consecutive digests.
 *
 * No pagination — digest windows are bounded (daily/weekly) and the volume
 * is expected to be small. If this assumption breaks, callers should add
 * a cap rather than mutating this helper into a paged query.
 */
export function listAutonomousActionsInWindow(
  db: BetterSQLite3Database,
  startDate: string,
  endDate: string
): GliaAction[] {
  const rows = db
    .select()
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.status, 'executed'),
        isNull(gliaActions.decidedAt),
        gte(gliaActions.executedAt, startDate),
        lt(gliaActions.executedAt, endDate)
      )
    )
    .orderBy(asc(gliaActions.executedAt))
    .all();
  return rows.map(toGliaAction);
}

/**
 * Count autonomous actions still in `executed` status since a given timestamp.
 *
 * Excludes reverted rows so the digest can compute the rejection rate as
 * `reverted / (executed + reverted)` without double-counting actions that
 * have already been rolled back.
 */
export function countAutonomousExecutionsSince(
  db: BetterSQLite3Database,
  actionType: ActionType,
  sinceIso: string
): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.actionType, actionType),
        eq(gliaActions.status, 'executed'),
        isNull(gliaActions.decidedAt),
        gte(gliaActions.executedAt, sinceIso)
      )
    )
    .get();
  return result?.count ?? 0;
}

/** Count autonomous reverts (decided_at IS NULL, status=reverted) since timestamp. */
export function countAutonomousRevertsSince(
  db: BetterSQLite3Database,
  actionType: ActionType,
  sinceIso: string
): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.actionType, actionType),
        eq(gliaActions.status, 'reverted'),
        isNull(gliaActions.decidedAt),
        // `revertedAt` is not schema-enforced as non-null, but in SQLite
        // `gte(col, value)` returns false for nulls and silently drops the
        // row. Make the intent explicit so a row with status='reverted' but
        // null revertedAt is excluded by design rather than by accident.
        isNotNull(gliaActions.revertedAt),
        gte(gliaActions.revertedAt, sinceIso)
      )
    )
    .get();
  return result?.count ?? 0;
}

/** Count reverts within a rolling window for a given action type. */
export function countRevertsInWindow(
  db: BetterSQLite3Database,
  actionType: ActionType,
  windowStart: string
): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.actionType, actionType),
        eq(gliaActions.status, 'reverted'),
        gte(gliaActions.revertedAt, windowStart)
      )
    )
    .get();
  return result?.count ?? 0;
}
