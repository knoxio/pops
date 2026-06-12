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
import { aiInferenceDaily } from '../schema.js';
import {
  createInferenceLog,
  deleteBudget,
  getBudget,
  getBudgetOrNull,
  listBudgets,
  listInferenceDaily,
  listInferenceLogs,
  sumInferenceLogUsage,
  upsertBudget,
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
