import { sql, type SQL } from 'drizzle-orm';

import { aiInferenceLog, type CoreDb } from '../../../db/index.js';

import type { ObservabilityFilters } from './types.js';

interface GroupRow {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function makeAggregates(keyExpr: SQL<string>): {
  key: SQL<string>;
  calls: SQL<number>;
  inputTokens: SQL<number>;
  outputTokens: SQL<number>;
  costUsd: SQL<number>;
} {
  return {
    key: keyExpr,
    calls: sql<number>`COUNT(*)`,
    inputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
    outputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
    costUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
  };
}

function groupBySqlExpression(
  db: CoreDb,
  where: SQL | undefined,
  keyExpr: SQL<string>
): GroupRow[] {
  return db
    .select(makeAggregates(keyExpr))
    .from(aiInferenceLog)
    .where(where)
    .groupBy(keyExpr)
    .all();
}

export function buildGroupings(
  db: CoreDb,
  where: SQL | undefined,
  _filters: ObservabilityFilters
): {
  byProvider: GroupRow[];
  byModel: GroupRow[];
  byDomain: GroupRow[];
  byOperation: GroupRow[];
} {
  return {
    byProvider: groupBySqlExpression(db, where, sql<string>`${aiInferenceLog.provider}`),
    byModel: groupBySqlExpression(db, where, sql<string>`${aiInferenceLog.model}`),
    byDomain: groupBySqlExpression(
      db,
      where,
      sql<string>`COALESCE(${aiInferenceLog.domain}, 'general')`
    ),
    byOperation: groupBySqlExpression(db, where, sql<string>`${aiInferenceLog.operation}`),
  };
}
