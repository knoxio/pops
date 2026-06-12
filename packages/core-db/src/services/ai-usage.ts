/**
 * AI usage persistence against the core pillar's SQLite via drizzle.
 *
 * Carries the three hot tables behind `core.aiUsage.*`:
 *   - `ai_inference_log` — append-only per-call record written by the
 *     inference middleware on every provider invocation. The dashboard
 *     reads it for stats + history. PRD-186 lists the surface as
 *     `core.aiUsage.log.{create,list}`.
 *   - `ai_inference_daily` — aggregate roll-up written by the retention
 *     job (PRD-092 US-08) once raw rows pass the 90-day horizon. The
 *     dashboard reads it for the continuous timeline across the retention
 *     boundary.
 *   - `ai_budgets` — small CRUD surface that gates AI calls. Budgets are
 *     scoped global / per-provider / per-operation; `checkAvailable`
 *     (PRD-186) consults them on the hot path before the middleware fires.
 *
 * Services take a `CoreDb` handle as their first argument; the calling
 * layer (pops-api modules) is responsible for resolving the singleton or
 * transaction handle to pass in. Mirrors `@pops/finance-db`'s service
 * signature pattern.
 *
 * The in-tree services in `apps/pops-api/src/modules/core/ai-usage/` and
 * `apps/pops-api/src/modules/core/ai-budgets/` still route through the
 * shared `getDrizzle()` handle for now — PRD-186 PR 3 flips that to
 * `getCoreDrizzle()` and routes through this module.
 */
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { AiBudgetNotFoundError } from '../errors.js';
import { aiBudgets, aiInferenceDaily, aiInferenceLog } from '../schema.js';

import type { CoreDb } from './internal.js';

/** Raw drizzle row shapes — persisted records. */
export type AiInferenceLogRow = typeof aiInferenceLog.$inferSelect;
export type AiInferenceLogInsert = typeof aiInferenceLog.$inferInsert;
export type AiInferenceDailyRow = typeof aiInferenceDaily.$inferSelect;
export type AiBudgetRow = typeof aiBudgets.$inferSelect;
export type AiBudgetInsert = typeof aiBudgets.$inferInsert;

/** Public aliases for the persisted records. */
export type AiInferenceLog = AiInferenceLogRow;
export type AiInferenceDaily = AiInferenceDailyRow;
export type AiBudget = AiBudgetRow;

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

/** Input for {@link upsertBudget}. `scopeValue` is required for non-global
 * scopes. `action` defaults to `warn` to match the shared journal. */
export interface UpsertBudgetInput {
  id: string;
  scopeType: 'global' | 'provider' | 'operation';
  scopeValue?: string | null;
  monthlyTokenLimit?: number | null;
  monthlyCostLimit?: number | null;
  action?: 'block' | 'warn' | 'fallback';
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

/** Read all configured budgets in insertion order. */
export function listBudgets(db: CoreDb): AiBudgetRow[] {
  return db.select().from(aiBudgets).all();
}

/** Read a single budget by id; returns `null` when absent. */
export function getBudgetOrNull(db: CoreDb, id: string): AiBudgetRow | null {
  return db.select().from(aiBudgets).where(eq(aiBudgets.id, id)).get() ?? null;
}

/** Read a single budget by id; throws {@link AiBudgetNotFoundError} when
 * absent. Prefer {@link getBudgetOrNull} when the caller wants to
 * fall back. */
export function getBudget(db: CoreDb, id: string): AiBudgetRow {
  const row = getBudgetOrNull(db, id);
  if (!row) throw new AiBudgetNotFoundError(id);
  return row;
}

/**
 * Upsert a budget. Returns the persisted row. The `scopeValue` column is
 * normalised to `null` for the `global` scope so the unique scope key is
 * always `(scope_type, scope_value)`-shaped from the reader's POV.
 */
export function upsertBudget(db: CoreDb, input: UpsertBudgetInput): AiBudgetRow {
  const now = new Date().toISOString();
  const scopeValue = input.scopeType === 'global' ? null : (input.scopeValue ?? null);
  const monthlyTokenLimit = input.monthlyTokenLimit ?? null;
  const monthlyCostLimit = input.monthlyCostLimit ?? null;
  const action = input.action ?? 'warn';

  db.insert(aiBudgets)
    .values({
      id: input.id,
      scopeType: input.scopeType,
      scopeValue,
      monthlyTokenLimit,
      monthlyCostLimit,
      action,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiBudgets.id,
      set: {
        scopeType: input.scopeType,
        scopeValue,
        monthlyTokenLimit,
        monthlyCostLimit,
        action,
        updatedAt: now,
      },
    })
    .run();

  return getBudget(db, input.id);
}

/** Delete a budget by id. Throws {@link AiBudgetNotFoundError} when no
 * row matched (`changes === 0`) — mirrors the in-tree pops-api service
 * so PRD-186 PR 3 can swap the handle without altering the error
 * contract observable from callers. */
export function deleteBudget(db: CoreDb, id: string): void {
  const result = db.delete(aiBudgets).where(eq(aiBudgets.id, id)).run();
  if (result.changes === 0) throw new AiBudgetNotFoundError(id);
}
