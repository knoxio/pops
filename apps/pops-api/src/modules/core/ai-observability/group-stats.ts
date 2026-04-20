import { sql, type SQL } from 'drizzle-orm';

import { aiInferenceLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

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

function groupBySqlExpression(where: SQL | undefined, keyExpr: SQL<string>): GroupRow[] {
  return getDrizzle()
    .select(makeAggregates(keyExpr))
    .from(aiInferenceLog)
    .where(where)
    .groupBy(keyExpr)
    .all();
}

export function buildGroupings(
  where: SQL | undefined,
  _filters: ObservabilityFilters
): {
  byProvider: GroupRow[];
  byModel: GroupRow[];
  byDomain: GroupRow[];
  byOperation: GroupRow[];
} {
  return {
    byProvider: groupBySqlExpression(where, sql<string>`${aiInferenceLog.provider}`),
    byModel: groupBySqlExpression(where, sql<string>`${aiInferenceLog.model}`),
    byDomain: groupBySqlExpression(
      where,
      sql<string>`COALESCE(${aiInferenceLog.domain}, 'general')`
    ),
    byOperation: groupBySqlExpression(where, sql<string>`${aiInferenceLog.operation}`),
  };
}
