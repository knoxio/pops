/**
 * Reflex execution history queries (PRD-089 US-05).
 *
 * Extracted from ReflexService to keep file sizes manageable. Each query takes
 * the cerebrum drizzle handle explicitly so the pillar owns its connection.
 */
import { and, desc, eq, sql } from 'drizzle-orm';

import { reflexExecutions } from '../../../db/index.js';
import { toReflexExecution } from './reflex-helpers.js';
import { getNextFireTime } from './triggers/scheduled-trigger.js';

import type { CerebrumDb } from '../../../db/index.js';
import type {
  ExecutionStatus,
  ReflexDefinition,
  ReflexExecution,
  ReflexWithStatus,
  TriggerType,
} from './types.js';

function getReflexStats(
  db: CerebrumDb,
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
export function enrichWithStatus(
  db: CerebrumDb,
  reflex: ReflexDefinition,
  timezone?: string
): ReflexWithStatus {
  const stats = getReflexStats(db, reflex.name);
  return {
    ...reflex,
    lastExecutionAt: stats?.lastTriggeredAt ?? null,
    nextFireTime: getNextFireTime(reflex, timezone),
    executionCount: stats?.executionCount ?? 0,
  };
}

/** Get a single reflex with recent execution history. */
export function getReflexHistory(
  db: CerebrumDb,
  reflex: ReflexDefinition,
  limit = 20
): { reflex: ReflexWithStatus; history: ReflexExecution[] } {
  const enriched = enrichWithStatus(db, reflex);
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
export function queryExecutionHistory(
  db: CerebrumDb,
  opts: {
    name?: string;
    triggerType?: TriggerType;
    status?: ExecutionStatus;
    limit?: number;
    offset?: number;
  }
): { executions: ReflexExecution[]; total: number } {
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
