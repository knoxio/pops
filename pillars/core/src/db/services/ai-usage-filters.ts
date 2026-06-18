/**
 * Shared filter shape + condition builder for `ai_inference_log` queries.
 * Lives here so both the base service (`ai-usage.ts`) and the dashboard
 * roll-ups (`ai-usage-dashboard.ts`) share a single canonical predicate
 * surface.
 */
import { and, eq, gte, lte, type SQL } from 'drizzle-orm';

import { aiInferenceLog } from '../schema.js';

/** Optional filters for inference-log queries. ISO timestamps for the
 * `[since, until]` window; simple equality matches on the remaining
 * indexed columns. */
export interface ListInferenceLogsFilter {
  since?: string;
  until?: string;
  provider?: string;
  model?: string;
  operation?: string;
  domain?: string;
  status?: string;
  contextId?: string;
}

export function buildInferenceLogConditions(filter: ListInferenceLogsFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.since) conditions.push(gte(aiInferenceLog.createdAt, filter.since));
  if (filter.until) conditions.push(lte(aiInferenceLog.createdAt, filter.until));
  if (filter.provider) conditions.push(eq(aiInferenceLog.provider, filter.provider));
  if (filter.model) conditions.push(eq(aiInferenceLog.model, filter.model));
  if (filter.operation) conditions.push(eq(aiInferenceLog.operation, filter.operation));
  if (filter.domain) conditions.push(eq(aiInferenceLog.domain, filter.domain));
  if (filter.status) conditions.push(eq(aiInferenceLog.status, filter.status));
  if (filter.contextId) conditions.push(eq(aiInferenceLog.contextId, filter.contextId));
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}
