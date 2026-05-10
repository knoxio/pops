/**
 * History endpoint helpers — UNIONs the recent rows in `ai_inference_log`
 * with the historical aggregates in `ai_inference_daily` (PRD-092 US-08)
 * so the dashboard sees a continuous timeline regardless of the retention
 * boundary.
 *
 * Split out of `service.ts` to keep both files under the file-size lint cap.
 */
import { and, gte, lte, sql } from 'drizzle-orm';

import { aiInferenceDaily, aiInferenceLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

import type { HistoryOutput, ObservabilityFilters } from './types.js';

interface DailyRecord {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cacheHits: number;
  errors: number;
}

function buildLogWhere(filters: ObservabilityFilters): ReturnType<typeof and> | undefined {
  const conditions = [];
  if (filters.provider) conditions.push(sql`${aiInferenceLog.provider} = ${filters.provider}`);
  if (filters.model) conditions.push(sql`${aiInferenceLog.model} = ${filters.model}`);
  if (filters.domain) {
    if (filters.domain === 'general') {
      conditions.push(sql`${aiInferenceLog.domain} IS NULL`);
    } else {
      conditions.push(sql`${aiInferenceLog.domain} = ${filters.domain}`);
    }
  }
  if (filters.operation) conditions.push(sql`${aiInferenceLog.operation} = ${filters.operation}`);
  if (filters.startDate) {
    conditions.push(gte(sql`DATE(${aiInferenceLog.createdAt})`, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(sql`DATE(${aiInferenceLog.createdAt})`, filters.endDate));
  }
  return conditions.length === 0 ? undefined : and(...conditions);
}

function buildDailyWhere(filters: ObservabilityFilters): ReturnType<typeof and> | undefined {
  const conditions = [];
  if (filters.provider) conditions.push(sql`${aiInferenceDaily.provider} = ${filters.provider}`);
  if (filters.model) conditions.push(sql`${aiInferenceDaily.model} = ${filters.model}`);
  if (filters.domain) {
    if (filters.domain === 'general') {
      conditions.push(sql`${aiInferenceDaily.domain} IS NULL`);
    } else {
      conditions.push(sql`${aiInferenceDaily.domain} = ${filters.domain}`);
    }
  }
  if (filters.operation) conditions.push(sql`${aiInferenceDaily.operation} = ${filters.operation}`);
  if (filters.startDate) conditions.push(gte(aiInferenceDaily.date, filters.startDate));
  if (filters.endDate) conditions.push(lte(aiInferenceDaily.date, filters.endDate));
  return conditions.length === 0 ? undefined : and(...conditions);
}

/**
 * Returns a per-day history of AI inference activity. Unions raw rows from
 * `ai_inference_log` (recent data) with aggregated rows from
 * `ai_inference_daily` (historical, retained indefinitely by the retention
 * job) so consumers see a continuous timeline regardless of the retention
 * boundary. When the same date exists in both tables (the retention boundary
 * day) values are summed.
 */
export function getHistory(filters: ObservabilityFilters = {}): HistoryOutput {
  const db = getDrizzle();
  const where = buildLogWhere(filters);

  const rawRecords = db
    .select({
      date: sql<string>`DATE(${aiInferenceLog.createdAt})`,
      calls: sql<number>`COUNT(*)`,
      inputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
      costUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
      cacheHits: sql<number>`SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END)`,
      errors: sql<number>`SUM(CASE WHEN ${aiInferenceLog.status} IN ('error','timeout','budget-blocked') THEN 1 ELSE 0 END)`,
    })
    .from(aiInferenceLog)
    .where(where)
    .groupBy(sql`DATE(${aiInferenceLog.createdAt})`)
    .all();

  const dailyWhere = buildDailyWhere(filters);
  const dailyRecords = db
    .select({
      date: aiInferenceDaily.date,
      calls: sql<number>`SUM(${aiInferenceDaily.totalCalls})`,
      inputTokens: sql<number>`SUM(${aiInferenceDaily.totalInputTokens})`,
      outputTokens: sql<number>`SUM(${aiInferenceDaily.totalOutputTokens})`,
      costUsd: sql<number>`SUM(${aiInferenceDaily.totalCostUsd})`,
      cacheHits: sql<number>`SUM(${aiInferenceDaily.cacheHitCount})`,
      errors: sql<number>`SUM(${aiInferenceDaily.errorCount} + ${aiInferenceDaily.timeoutCount} + ${aiInferenceDaily.budgetBlockedCount})`,
    })
    .from(aiInferenceDaily)
    .where(dailyWhere)
    .groupBy(aiInferenceDaily.date)
    .all();

  const merged = new Map<string, DailyRecord>();
  for (const r of rawRecords) merged.set(r.date, { ...r });
  for (const r of dailyRecords) {
    const existing = merged.get(r.date);
    if (existing) {
      existing.calls += r.calls;
      existing.inputTokens += r.inputTokens;
      existing.outputTokens += r.outputTokens;
      existing.costUsd += r.costUsd;
      existing.cacheHits += r.cacheHits;
      existing.errors += r.errors;
    } else {
      merged.set(r.date, { ...r });
    }
  }

  const records = Array.from(merged.values()).toSorted((a, b) => (a.date < b.date ? 1 : -1));

  return {
    records,
    summary: {
      totalCostUsd: records.reduce((s, r) => s + r.costUsd, 0),
      totalCalls: records.reduce((s, r) => s + r.calls, 0),
      totalCacheHits: records.reduce((s, r) => s + r.cacheHits, 0),
    },
  };
}
