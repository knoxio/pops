import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedAiUsage, setupTestContext } from '../../../shared/test-utils.js';
import * as service from './service.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('getBudgetStatus', () => {
  it('returns empty when no budgets exist', () => {
    expect(service.getBudgetStatus()).toHaveLength(0);
  });

  it('returns correct percentageUsed for a cost-limited budget', () => {
    service.upsertBudget({ id: 'global', scopeType: 'global', monthlyCostLimit: 10 });
    seedAiUsage(db, { cost_usd: 2.5, created_at: new Date().toISOString() });
    seedAiUsage(db, { cost_usd: 2.5, created_at: new Date().toISOString() });

    const [status] = service.getBudgetStatus();
    expect(status?.percentageUsed).toBeCloseTo(50);
    expect(status?.currentCostUsage).toBeCloseTo(5);
  });

  it('returns correct percentageUsed for a token-limited budget', () => {
    service.upsertBudget({ id: 'global', scopeType: 'global', monthlyTokenLimit: 1000 });
    seedAiUsage(db, {
      input_tokens: 300,
      output_tokens: 200,
      created_at: new Date().toISOString(),
    });

    const [status] = service.getBudgetStatus();
    expect(status?.percentageUsed).toBeCloseTo(50);
    expect(status?.currentTokenUsage).toBe(500);
  });

  it('percentageUsed is null when no limit is configured', () => {
    service.upsertBudget({ id: 'global', scopeType: 'global' });
    seedAiUsage(db, { cost_usd: 5, created_at: new Date().toISOString() });

    const [status] = service.getBudgetStatus();
    expect(status?.percentageUsed).toBeNull();
    expect(status?.projectedExhaustionDate).toBeNull();
  });

  it('projectedExhaustionDate is null when usage is zero', () => {
    service.upsertBudget({ id: 'global', scopeType: 'global', monthlyCostLimit: 100 });

    const [status] = service.getBudgetStatus();
    expect(status?.currentCostUsage).toBe(0);
    expect(status?.projectedExhaustionDate).toBeNull();
  });

  it('projectedExhaustionDate is a YYYY-MM-DD string when usage is non-zero', () => {
    service.upsertBudget({ id: 'global', scopeType: 'global', monthlyCostLimit: 1000 });
    // 1% usage on any day of the month keeps exhaustion within a 4-digit year
    seedAiUsage(db, { cost_usd: 10, created_at: new Date().toISOString() });

    const [status] = service.getBudgetStatus();
    expect(status?.projectedExhaustionDate).not.toBeNull();
    expect(status?.projectedExhaustionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('scopes usage to the matching provider for a provider-scoped budget', () => {
    service.upsertBudget({
      id: 'claude-budget',
      scopeType: 'provider',
      scopeValue: 'claude',
      monthlyCostLimit: 10,
    });
    seedAiUsage(db, { provider: 'claude', cost_usd: 3, created_at: new Date().toISOString() });
    seedAiUsage(db, { provider: 'ollama', cost_usd: 5, created_at: new Date().toISOString() });

    const [status] = service.getBudgetStatus();
    expect(status?.currentCostUsage).toBeCloseTo(3);
    expect(status?.percentageUsed).toBeCloseTo(30);
  });

  it('scopes usage to the matching operation for an operation-scoped budget', () => {
    service.upsertBudget({
      id: 'match-budget',
      scopeType: 'operation',
      scopeValue: 'entity-match',
      monthlyTokenLimit: 500,
    });
    seedAiUsage(db, {
      operation: 'entity-match',
      input_tokens: 100,
      output_tokens: 50,
      created_at: new Date().toISOString(),
    });
    seedAiUsage(db, {
      operation: 'nl-query',
      input_tokens: 400,
      output_tokens: 200,
      created_at: new Date().toISOString(),
    });

    const [status] = service.getBudgetStatus();
    expect(status?.currentTokenUsage).toBe(150);
    expect(status?.percentageUsed).toBeCloseTo(30);
  });

  it('cost limit takes priority over token limit when both are set', () => {
    service.upsertBudget({
      id: 'dual',
      scopeType: 'global',
      monthlyCostLimit: 20,
      monthlyTokenLimit: 1000,
    });
    seedAiUsage(db, {
      cost_usd: 4,
      input_tokens: 100,
      output_tokens: 50,
      created_at: new Date().toISOString(),
    });

    const [status] = service.getBudgetStatus();
    // percentageUsed should be based on cost (4/20 = 20%), not tokens (150/1000 = 15%)
    expect(status?.percentageUsed).toBeCloseTo(20);
  });
});
