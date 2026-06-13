/**
 * Invariant tests for the ai-usage service against an in-memory SQLite
 * seeded with the canonical `0057_ai_usage_baseline.sql` migration. Pure
 * DB + service layer — no tRPC, no Express, no inference middleware.
 *
 * Higher-level router-level coverage continues to live in pops-api's own
 * suite (`apps/pops-api/src/modules/core/ai-usage/ai-usage.test.ts` and
 * `apps/pops-api/src/modules/core/ai-budgets/*.test.ts`) and exercises the
 * same persisted shape via the in-tree shim until PRD-186 PR 3 flips it
 * onto this service.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { AiBudgetNotFoundError } from '../errors.js';
import { aiInferenceDaily, aiInferenceLog } from '../schema.js';
import {
  createInferenceLog,
  deleteBudget,
  deleteInferenceLogsByIds,
  fetchAgedInferenceLogs,
  getBudget,
  getBudgetOrNull,
  listBudgets,
  listInferenceDaily,
  listInferenceLogs,
  recordInferenceDaily,
  sumInferenceLogUsage,
  upsertBudget,
  type InferenceDailyAggregate,
} from '../services/ai-usage.js';

import type { CoreDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../migrations/0057_ai_usage_baseline.sql');

function freshDb(): CoreDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

function logBase(overrides: Partial<Parameters<typeof createInferenceLog>[1]> = {}) {
  return {
    provider: 'claude',
    model: 'sonnet',
    operation: 'classify',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.0015,
    latencyMs: 250,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createInferenceLog', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a row with the supplied fields and auto-assigned id', () => {
    const row = createInferenceLog(db, logBase());
    expect(row.id).toBeGreaterThan(0);
    expect(row.provider).toBe('claude');
    expect(row.model).toBe('sonnet');
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(50);
    expect(row.status).toBe('success');
    expect(row.cached).toBe(0);
  });

  it('defaults numeric counters to 0 and status to "success"', () => {
    const row = createInferenceLog(db, {
      provider: 'openai',
      model: 'gpt-4',
      operation: 'embed',
      createdAt: '2026-06-02T00:00:00.000Z',
    });
    expect(row.inputTokens).toBe(0);
    expect(row.outputTokens).toBe(0);
    expect(row.costUsd).toBe(0);
    expect(row.latencyMs).toBe(0);
    expect(row.status).toBe('success');
    expect(row.cached).toBe(0);
    expect(row.domain).toBeNull();
    expect(row.contextId).toBeNull();
    expect(row.errorMessage).toBeNull();
    expect(row.metadata).toBeNull();
  });

  it('uses the current UTC ISO timestamp when createdAt is omitted', () => {
    const before = new Date().toISOString();
    const row = createInferenceLog(db, {
      provider: 'claude',
      model: 'sonnet',
      operation: 'classify',
    });
    const after = new Date().toISOString();
    expect(row.createdAt >= before).toBe(true);
    expect(row.createdAt <= after).toBe(true);
  });

  it('persists optional metadata + domain + contextId columns', () => {
    const row = createInferenceLog(db, {
      ...logBase(),
      domain: 'finance',
      contextId: 'ctx_123',
      metadata: '{"foo":"bar"}',
      errorMessage: null,
    });
    expect(row.domain).toBe('finance');
    expect(row.contextId).toBe('ctx_123');
    expect(row.metadata).toBe('{"foo":"bar"}');
  });
});

describe('listInferenceLogs', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
    createInferenceLog(
      db,
      logBase({ createdAt: '2026-06-01T00:00:00.000Z', operation: 'classify' })
    );
    createInferenceLog(db, logBase({ createdAt: '2026-06-02T00:00:00.000Z', operation: 'embed' }));
    createInferenceLog(
      db,
      logBase({ createdAt: '2026-06-03T00:00:00.000Z', operation: 'classify', provider: 'openai' })
    );
  });

  it('returns rows newest-first by createdAt', () => {
    const rows = listInferenceLogs(db, {}, 10, 0);
    expect(rows.map((r) => r.createdAt)).toEqual([
      '2026-06-03T00:00:00.000Z',
      '2026-06-02T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z',
    ]);
  });

  it('honours limit + offset', () => {
    const page1 = listInferenceLogs(db, {}, 2, 0);
    const page2 = listInferenceLogs(db, {}, 2, 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });

  it('filters by provider', () => {
    const rows = listInferenceLogs(db, { provider: 'openai' }, 10, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe('openai');
  });

  it('filters by operation', () => {
    const rows = listInferenceLogs(db, { operation: 'classify' }, 10, 0);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.operation === 'classify')).toBe(true);
  });

  it('filters by [since, until] window inclusive', () => {
    const rows = listInferenceLogs(
      db,
      { since: '2026-06-02T00:00:00.000Z', until: '2026-06-02T23:59:59.999Z' },
      10,
      0
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdAt).toBe('2026-06-02T00:00:00.000Z');
  });
});

describe('sumInferenceLogUsage', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
    createInferenceLog(db, logBase({ inputTokens: 100, outputTokens: 50, costUsd: 0.001 }));
    createInferenceLog(
      db,
      logBase({ inputTokens: 200, outputTokens: 75, costUsd: 0.002, cached: 1 })
    );
    createInferenceLog(db, logBase({ inputTokens: 300, outputTokens: 100, costUsd: 0.003 }));
  });

  it('aggregates totals across all rows when filter is empty', () => {
    const agg = sumInferenceLogUsage(db, {});
    expect(agg.totalCalls).toBe(3);
    expect(agg.totalInputTokens).toBe(600);
    expect(agg.totalOutputTokens).toBe(225);
    expect(agg.totalCostUsd).toBeCloseTo(0.006, 6);
    expect(agg.cachedCalls).toBe(1);
  });

  it('returns zeros on an empty table', () => {
    const empty = freshDb();
    const agg = sumInferenceLogUsage(empty, {});
    expect(agg).toEqual({
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      cachedCalls: 0,
    });
  });
});

describe('listInferenceDaily', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
    db.insert(aiInferenceDaily)
      .values([
        {
          date: '2026-05-30',
          provider: 'claude',
          model: 'sonnet',
          operation: 'classify',
          totalCalls: 10,
          totalInputTokens: 1000,
          totalOutputTokens: 500,
          totalCostUsd: 0.01,
        },
        {
          date: '2026-06-01',
          provider: 'claude',
          model: 'sonnet',
          operation: 'classify',
          totalCalls: 20,
          totalCostUsd: 0.02,
        },
        {
          date: '2026-06-05',
          provider: 'openai',
          model: 'gpt-4',
          operation: 'embed',
          totalCalls: 5,
        },
      ])
      .run();
  });

  it('returns rows newest-first', () => {
    const rows = listInferenceDaily(db, {});
    expect(rows.map((r) => r.date)).toEqual(['2026-06-05', '2026-06-01', '2026-05-30']);
  });

  it('honours start/end date window', () => {
    const rows = listInferenceDaily(db, { startDate: '2026-06-01', endDate: '2026-06-04' });
    expect(rows.map((r) => r.date)).toEqual(['2026-06-01']);
  });
});

describe('fetchAgedInferenceLogs', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
    createInferenceLog(db, logBase({ createdAt: '2026-01-01T00:00:00.000Z' }));
    createInferenceLog(db, logBase({ createdAt: '2026-02-01T00:00:00.000Z' }));
    createInferenceLog(db, logBase({ createdAt: '2026-06-01T00:00:00.000Z' }));
  });

  it('returns rows older than or equal to the cutoff', () => {
    const batch = fetchAgedInferenceLogs(db, '2026-02-01T00:00:00.000Z', 10);
    expect(batch.map((b) => b.row.createdAt).toSorted()).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ]);
  });

  it('honours batchSize as a hard ceiling', () => {
    const batch = fetchAgedInferenceLogs(db, '2026-12-31T00:00:00.000Z', 2);
    expect(batch).toHaveLength(2);
  });

  it('returns rows ordered by id ascending so consecutive batches make progress', () => {
    const batch = fetchAgedInferenceLogs(db, '2026-12-31T00:00:00.000Z', 10);
    const ids = batch.map((b) => b.id);
    expect(ids).toEqual([...ids].toSorted((a, b) => a - b));
  });
});

describe('recordInferenceDaily', () => {
  let db: CoreDb;
  const baseAgg: InferenceDailyAggregate = {
    date: '2026-05-01',
    provider: 'claude',
    model: 'sonnet',
    operation: 'classify',
    domain: 'finance',
    totalCalls: 10,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalCostUsd: 0.01,
    avgLatencyMs: 100,
    errorCount: 1,
    timeoutCount: 0,
    cacheHitCount: 2,
    budgetBlockedCount: 0,
  };

  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a fresh aggregate row', () => {
    recordInferenceDaily(db, baseAgg);
    const rows = listInferenceDaily(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.totalCalls).toBe(10);
    expect(rows[0]?.avgLatencyMs).toBe(100);
  });

  it('folds new counters into an existing bucket on the same natural key', () => {
    recordInferenceDaily(db, baseAgg);
    recordInferenceDaily(db, {
      ...baseAgg,
      totalCalls: 5,
      totalInputTokens: 500,
      totalCostUsd: 0.005,
      avgLatencyMs: 200,
      errorCount: 2,
      cacheHitCount: 1,
    });

    const rows = listInferenceDaily(db, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.totalCalls).toBe(15);
    expect(rows[0]?.totalInputTokens).toBe(1500);
    expect(rows[0]?.totalCostUsd).toBeCloseTo(0.015, 6);
    expect(rows[0]?.errorCount).toBe(3);
    expect(rows[0]?.cacheHitCount).toBe(3);
  });

  it('computes weighted-mean avgLatencyMs across folds', () => {
    recordInferenceDaily(db, { ...baseAgg, totalCalls: 5, avgLatencyMs: 100 });
    recordInferenceDaily(db, { ...baseAgg, totalCalls: 3, avgLatencyMs: 200 });

    const rows = listInferenceDaily(db, {});
    // ((5*100) + (3*200)) / 8 = 137.5 → CAST AS INTEGER → 137
    expect(rows[0]?.avgLatencyMs).toBe(137);
  });

  it('treats different domains as distinct buckets', () => {
    recordInferenceDaily(db, { ...baseAgg, domain: 'finance' });
    recordInferenceDaily(db, { ...baseAgg, domain: 'media' });
    recordInferenceDaily(db, { ...baseAgg, domain: null });

    const rows = listInferenceDaily(db, {});
    expect(rows).toHaveLength(3);
  });

  it('folds null-domain aggregates into a single bucket via the empty-string sentinel', () => {
    recordInferenceDaily(db, { ...baseAgg, domain: null, totalCalls: 4 });
    recordInferenceDaily(db, { ...baseAgg, domain: null, totalCalls: 6 });

    const rows = listInferenceDaily(db, {});
    const nullDomainRows = rows.filter((r) => r.domain === '' || r.domain === null);
    expect(nullDomainRows).toHaveLength(1);
    expect(nullDomainRows[0]?.totalCalls).toBe(10);
  });
});

describe('deleteInferenceLogsByIds', () => {
  let db: CoreDb;
  let ids: number[];
  beforeEach(() => {
    db = freshDb();
    const a = createInferenceLog(db, logBase({ createdAt: '2026-01-01T00:00:00.000Z' }));
    const b = createInferenceLog(db, logBase({ createdAt: '2026-02-01T00:00:00.000Z' }));
    const c = createInferenceLog(db, logBase({ createdAt: '2026-03-01T00:00:00.000Z' }));
    ids = [a.id, b.id, c.id];
  });

  it('removes only the rows whose ids are supplied', () => {
    const [first, , third] = ids;
    deleteInferenceLogsByIds(db, [first as number, third as number]);

    const remaining = db.select({ id: aiInferenceLog.id }).from(aiInferenceLog).all();
    expect(remaining.map((r) => r.id)).toEqual([ids[1]]);
  });

  it('is a no-op for an empty id list', () => {
    deleteInferenceLogsByIds(db, []);
    const remaining = db.select({ id: aiInferenceLog.id }).from(aiInferenceLog).all();
    expect(remaining).toHaveLength(3);
  });
});

describe('upsertBudget / getBudget / listBudgets', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a new budget and returns the persisted row', () => {
    const row = upsertBudget(db, {
      id: 'global',
      scopeType: 'global',
      monthlyCostLimit: 100,
      action: 'block',
    });
    expect(row.id).toBe('global');
    expect(row.scopeType).toBe('global');
    expect(row.scopeValue).toBeNull();
    expect(row.monthlyCostLimit).toBe(100);
    expect(row.action).toBe('block');
  });

  it('coerces scopeValue to null for global scope even when supplied', () => {
    const row = upsertBudget(db, {
      id: 'global',
      scopeType: 'global',
      scopeValue: 'ignored',
      monthlyCostLimit: 50,
    });
    expect(row.scopeValue).toBeNull();
  });

  it('updates an existing budget on the second call (UPSERT)', () => {
    upsertBudget(db, { id: 'b1', scopeType: 'global', monthlyCostLimit: 100 });
    const updated = upsertBudget(db, { id: 'b1', scopeType: 'global', monthlyCostLimit: 200 });
    expect(updated.monthlyCostLimit).toBe(200);
    expect(listBudgets(db)).toHaveLength(1);
  });

  it('preserves createdAt across an UPSERT-update', () => {
    const original = upsertBudget(db, {
      id: 'b1',
      scopeType: 'global',
      monthlyCostLimit: 100,
    });
    const updated = upsertBudget(db, {
      id: 'b1',
      scopeType: 'global',
      monthlyCostLimit: 200,
    });
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.updatedAt >= original.updatedAt).toBe(true);
  });

  it('defaults action to "warn" when omitted', () => {
    const row = upsertBudget(db, {
      id: 'p1',
      scopeType: 'provider',
      scopeValue: 'claude',
      monthlyTokenLimit: 1000,
    });
    expect(row.action).toBe('warn');
  });

  it('getBudget throws AiBudgetNotFoundError when the id is absent', () => {
    expect(() => getBudget(db, 'missing')).toThrow(AiBudgetNotFoundError);
  });

  it('getBudgetOrNull returns null for missing ids', () => {
    expect(getBudgetOrNull(db, 'missing')).toBeNull();
  });

  it('listBudgets returns all configured budgets', () => {
    upsertBudget(db, { id: 'global', scopeType: 'global', monthlyCostLimit: 100 });
    upsertBudget(db, {
      id: 'claude',
      scopeType: 'provider',
      scopeValue: 'claude',
      monthlyTokenLimit: 1000,
    });
    expect(listBudgets(db)).toHaveLength(2);
  });
});

describe('deleteBudget', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes the row when present', () => {
    upsertBudget(db, { id: 'b1', scopeType: 'global', monthlyCostLimit: 100 });
    deleteBudget(db, 'b1');
    expect(getBudgetOrNull(db, 'b1')).toBeNull();
  });

  it('throws AiBudgetNotFoundError when no row matched', () => {
    expect(() => deleteBudget(db, 'missing')).toThrow(AiBudgetNotFoundError);
  });
});
