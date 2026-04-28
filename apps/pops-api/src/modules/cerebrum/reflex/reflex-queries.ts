/**
 * Reflex execution history queries (PRD-089 US-05).
 *
 * Extracted from ReflexService to keep file sizes manageable.
 */
import { desc, eq, sql, and } from 'drizzle-orm';

import { reflexExecutions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { toReflexExecution } from './reflex-helpers.js';
import { getNextFireTime } from './triggers/scheduled-trigger.js';

import type { BetterSQLite3Database } from '../../../db.js';
import type {
  ReflexDefinition,
  ReflexExecution,
  ReflexWithStatus,
  TriggerType,
  ExecutionStatus,
} from './types.js';

function getDb(): BetterSQLite3Database {
  return getDrizzle();
}

function getReflexStats(
  db: BetterSQLite3Database,
  name: string
): { lastTriggeredAt: string | null; executionCount: number } | undefined {
  return db
    .select({
      lastTriggeredAt: sql<string | null>`MAX(${reflexExecutions.triggeredAt})`,
      executionCount: sql<number>`COUNT(*)`,
    })
    .from(reflexExecutions)
    .where(eq(reflexExecutions.reflexName, name))
    .get();
}

/** Enrich a reflex definition with runtime status. */
export function enrichWithStatus(reflex: ReflexDefinition, timezone?: string): ReflexWithStatus {
  const stats = getReflexStats(getDb(), reflex.name);
  return {
    ...reflex,
    lastExecutionAt: stats?.lastTriggeredAt ?? null,
    nextFireTime: getNextFireTime(reflex, timezone),
    executionCount: stats?.executionCount ?? 0,
  };
}

/** Get a single reflex with recent execution history. */
export function getReflexHistory(
  reflex: ReflexDefinition,
  limit = 20
): { reflex: ReflexWithStatus; history: ReflexExecution[] } {
  const db = getDb();
  const enriched = enrichWithStatus(reflex);
  const history = db
    .select()
    .from(reflexExecutions)
    .where(eq(reflexExecutions.reflexName, reflex.name))
    .orderBy(desc(reflexExecutions.triggeredAt))
    .limit(limit)
    .all()
    .map(toReflexExecution);

  return { reflex: enriched, history };
}

/** Paginated execution history query. */
export function queryExecutionHistory(opts: {
  name?: string;
  triggerType?: TriggerType;
  status?: ExecutionStatus;
  limit?: number;
  offset?: number;
}): { executions: ReflexExecution[]; total: number } {
  const db = getDb();
  const conditions = [];
  if (opts.name) conditions.push(eq(reflexExecutions.reflexName, opts.name));
  if (opts.triggerType) conditions.push(eq(reflexExecutions.triggerType, opts.triggerType));
  if (opts.status) conditions.push(eq(reflexExecutions.status, opts.status));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(reflexExecutions)
    .where(whereClause)
    .get();
  const rows = db
    .select()
    .from(reflexExecutions)
    .where(whereClause)
    .orderBy(desc(reflexExecutions.triggeredAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0)
    .all();

  return { executions: rows.map(toReflexExecution), total: totalResult?.count ?? 0 };
}
