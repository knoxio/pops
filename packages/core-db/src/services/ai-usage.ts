/**
 * AI usage persistence against the core pillar's SQLite via drizzle.
 *
 * Carries the three hot tables behind `core.aiUsage.*`:
 *   - `ai_inference_log` — append-only per-call record written by the
 *     inference middleware on every provider invocation. The dashboard
 *     reads it for stats + history.
 *   - `ai_inference_daily` — aggregate roll-up written by the retention
 *     job (PRD-092 US-08) once raw rows pass the 90-day horizon. The
 *     dashboard reads it for the continuous timeline across the retention
 *     boundary. Helpers live in `./ai-usage-retention.ts`.
 *   - `ai_budgets` — small CRUD surface that gates AI calls. Budgets are
 *     scoped global / per-provider / per-operation; consulted on the hot
 *     path before the middleware fires. CRUD lives in
 *     `./ai-usage-budgets.ts`.
 *
 * Services take a `CoreDb` handle as their first argument; the calling
 * layer (pops-api modules) is responsible for resolving the singleton or
 * transaction handle to pass in. Mirrors `@pops/finance-db`'s service
 * signature pattern.
 *
 * Post-PRD-186 PR 3: every read AND write site in `apps/pops-api` routes
 * through this module against `getCoreDrizzle()`. The boot-time
 * `pops.db -> core.db` backfill bridges any pre-cutover rows; PR 4 drops
 * the legacy `ai_*` tables from the shared journal.
 */
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { aiInferenceDaily, aiInferenceLog } from '../schema.js';

import type { CoreDb } from './internal.js';

export {
  deleteBudget,
  getBudget,
  getBudgetOrNull,
  listBudgets,
  upsertBudget,
  type AiBudget,
  type AiBudgetInsert,
  type AiBudgetRow,
  type UpsertBudgetInput,
} from './ai-usage-budgets.js';

export {
  deleteInferenceLogsByIds,
  fetchAgedInferenceLogs,
  recordInferenceDaily,
  type InferenceDailyAggregate,
  type InferenceLogRetentionRow,
} from './ai-usage-retention.js';

/** Raw drizzle row shapes — persisted records. */
export type AiInferenceLogRow = typeof aiInferenceLog.$inferSelect;
export type AiInferenceLogInsert = typeof aiInferenceLog.$inferInsert;
export type AiInferenceDailyRow = typeof aiInferenceDaily.$inferSelect;

/** Public aliases for the persisted records. */
export type AiInferenceLog = AiInferenceLogRow;
export type AiInferenceDaily = AiInferenceDailyRow;

/** Input for an `ai_inference_log` insert. `created_at` is auto-filled
 * to the current UTC ISO timestamp when the caller omits it so the log
 * call site stays terse. */
export interface CreateInferenceLogInput {
  provider: string;
  model: string;
  operation: string;
  domain?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  status?: string;
  cached?: number;
  contextId?: string | null;
  errorMessage?: string | null;
  metadata?: string | null;
  createdAt?: string;
}

/** Optional filters for {@link listInferenceLogs}. ISO timestamps. */
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

function buildInferenceLogInsert(input: CreateInferenceLogInput): AiInferenceLogInsert {
  return {
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    domain: input.domain ?? null,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    costUsd: input.costUsd ?? 0,
    latencyMs: input.latencyMs ?? 0,
    status: input.status ?? 'success',
    cached: input.cached ?? 0,
    contextId: input.contextId ?? null,
    errorMessage: input.errorMessage ?? null,
    metadata: input.metadata ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Append an `ai_inference_log` row. Returns the persisted row including
 * the auto-assigned `id`. The log is append-only — no UPSERT semantics.
 */
export function createInferenceLog(db: CoreDb, input: CreateInferenceLogInput): AiInferenceLogRow {
  const values = buildInferenceLogInsert(input);
  const inserted = db.insert(aiInferenceLog).values(values).returning().get();
  if (!inserted) throw new Error('Failed to insert ai_inference_log row');
  return inserted;
}

function buildInferenceLogConditions(filter: ListInferenceLogsFilter): SQL | undefined {
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

/**
 * List `ai_inference_log` rows newest-first, with optional filters and
 * pagination. The filter accepts simple equality matches on the indexed
 * columns plus a `[since, until]` time window on `created_at`.
 */
export function listInferenceLogs(
  db: CoreDb,
  filter: ListInferenceLogsFilter,
  limit: number,
  offset: number
): AiInferenceLogRow[] {
  const condition = buildInferenceLogConditions(filter);
  return db
    .select()
    .from(aiInferenceLog)
    .where(condition)
    .orderBy(desc(aiInferenceLog.createdAt), desc(aiInferenceLog.id))
    .limit(limit)
    .offset(offset)
    .all();
}

/** Aggregate counters across `ai_inference_log` under the supplied filter.
 * Used by the dashboard's stats endpoint without re-implementing the
 * SQL each time. */
export function sumInferenceLogUsage(
  db: CoreDb,
  filter: ListInferenceLogsFilter
): {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  cachedCalls: number;
} {
  const condition = buildInferenceLogConditions(filter);
  const [row] = db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
      totalCostUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
      cachedCalls: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END), 0)`,
    })
    .from(aiInferenceLog)
    .where(condition)
    .all();
  return (
    row ?? {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      cachedCalls: 0,
    }
  );
}

/**
 * List `ai_inference_daily` rows newest-first within the optional date
 * window. Date filters compare lexicographically against the
 * `YYYY-MM-DD` text column.
 */
export function listInferenceDaily(
  db: CoreDb,
  filter: { startDate?: string; endDate?: string }
): AiInferenceDailyRow[] {
  const conditions: SQL[] = [];
  if (filter.startDate) conditions.push(gte(aiInferenceDaily.date, filter.startDate));
  if (filter.endDate) conditions.push(lte(aiInferenceDaily.date, filter.endDate));
  const condition = (() => {
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  })();
  return db
    .select()
    .from(aiInferenceDaily)
    .where(condition)
    .orderBy(desc(aiInferenceDaily.date), desc(aiInferenceDaily.id))
    .all();
}
