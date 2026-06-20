/**
 * Persistence + listing helpers for fired alerts.
 *
 * Separated from the evaluator orchestrator so each module stays focused
 * and within the project's max-lines lint budget.
 *
 * Reads + writes resolve against the request-scoped core drizzle handle
 * threaded in by the caller, over the relocated `ai_alerts` table.
 */
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { aiAlerts, type CoreDb } from '../../../db/index.js';
import { alertRowToAlert } from './mappers.js';

import type { AlertCandidate, AlertRuleType, AlertSeverity, FiredAlert } from './types.js';

export const DEDUP_WINDOW_MINUTES = 60;

/** Has an alert with the same `(type, scope_detail)` already fired in the dedup window? */
export function isDuplicate(db: CoreDb, candidate: AlertCandidate, now: Date): boolean {
  const cutoff = new Date(now.getTime() - DEDUP_WINDOW_MINUTES * 60 * 1000).toISOString();
  const conditions = [eq(aiAlerts.type, candidate.type), gte(aiAlerts.createdAt, cutoff)];
  if (candidate.scopeDetail === null) {
    conditions.push(sql`${aiAlerts.scopeDetail} IS NULL`);
  } else {
    conditions.push(eq(aiAlerts.scopeDetail, candidate.scopeDetail));
  }
  const [row] = db
    .select({ id: aiAlerts.id })
    .from(aiAlerts)
    .where(and(...conditions))
    .limit(1)
    .all();
  return row !== undefined;
}

export function insertAlert(db: CoreDb, candidate: AlertCandidate, now: Date): FiredAlert {
  const result = db
    .insert(aiAlerts)
    .values({
      ruleId: candidate.ruleId,
      type: candidate.type,
      message: candidate.message,
      severity: candidate.severity,
      scopeDetail: candidate.scopeDetail,
      metricValue: candidate.metricValue,
      thresholdValue: candidate.thresholdValue,
      acknowledged: 0,
      createdAt: now.toISOString(),
    })
    .returning()
    .all();
  const row = result[0];
  if (!row) throw new Error('Insert into ai_alerts returned no rows');
  return alertRowToAlert(row);
}

/**
 * Atomically check-then-insert: returns the persisted row when the candidate
 * was new, or `null` when an alert with the same `(type, scope_detail)` is
 * already present inside the rolling dedup window.
 *
 * The dedup window is time-based and therefore cannot be expressed as a
 * static UNIQUE constraint; we wrap the check and the insert in a single
 * SQLite write transaction so two concurrent evaluator runs cannot both
 * pass the duplicate check and double-fire.
 */
export function insertAlertIfNotDuplicate(
  db: CoreDb,
  candidate: AlertCandidate,
  now: Date
): FiredAlert | null {
  return db.transaction((tx) => {
    if (isDuplicate(tx, candidate, now)) return null;
    return insertAlert(tx, candidate, now);
  });
}

export interface ListAlertsFilters {
  acknowledged?: boolean;
  type?: AlertRuleType;
  severity?: AlertSeverity;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

function buildListConditions(filters: ListAlertsFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.acknowledged !== undefined) {
    conditions.push(eq(aiAlerts.acknowledged, filters.acknowledged ? 1 : 0));
  }
  if (filters.type) conditions.push(eq(aiAlerts.type, filters.type));
  if (filters.severity) conditions.push(eq(aiAlerts.severity, filters.severity));
  if (filters.startDate) conditions.push(gte(aiAlerts.createdAt, filters.startDate));
  if (filters.endDate) conditions.push(lte(aiAlerts.createdAt, filters.endDate));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function listAlerts(
  db: CoreDb,
  filters: ListAlertsFilters = {}
): {
  alerts: FiredAlert[];
  total: number;
} {
  const where = buildListConditions(filters);
  const baseQuery = db.select().from(aiAlerts);
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  const rows = (where ? baseQuery.where(where) : baseQuery)
    .orderBy(desc(aiAlerts.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
  const countQuery = db.select({ total: sql<number>`COUNT(*)` }).from(aiAlerts);
  const [totalRow] = (where ? countQuery.where(where) : countQuery).all();
  return {
    alerts: rows.map(alertRowToAlert),
    total: totalRow?.total ?? 0,
  };
}

export function acknowledgeAlert(
  db: CoreDb,
  id: number,
  now: Date = new Date()
): FiredAlert | null {
  const result = db
    .update(aiAlerts)
    .set({ acknowledged: 1, acknowledgedAt: now.toISOString() })
    .where(eq(aiAlerts.id, id))
    .returning()
    .all();
  const row = result[0];
  return row ? alertRowToAlert(row) : null;
}
