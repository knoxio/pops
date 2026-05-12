import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedAiUsage, seedSetting, setupTestContext } from '../../../shared/test-utils.js';
import { setRawSetting } from '../settings/service.js';
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

describe('evaluateBudgetsForCall', () => {
  it('returns no breaches when no budgets exist', () => {
    const { breaches, allBudgets } = service.evaluateBudgetsForCall('claude', 'entity-match');
    expect(breaches).toHaveLength(0);
    expect(allBudgets).toHaveLength(0);
  });

  it('identifies a cost breach on a global budget', () => {
    service.upsertBudget({
      id: 'global',
      scopeType: 'global',
      monthlyCostLimit: 1,
      action: 'block',
    });
    seedAiUsage(db, { cost_usd: 1.1, created_at: new Date().toISOString() });

    const { breaches } = service.evaluateBudgetsForCall('claude', 'entity-match');
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.limitType).toBe('cost');
    expect(breaches[0]?.budget.id).toBe('global');
  });

  it('ignores provider-scoped budgets for a different provider', () => {
    service.upsertBudget({
      id: 'ollama-budget',
      scopeType: 'provider',
      scopeValue: 'ollama',
      monthlyCostLimit: 1,
      action: 'block',
    });
    seedAiUsage(db, {
      provider: 'ollama',
      cost_usd: 2,
      created_at: new Date().toISOString(),
    });

    // The Claude call should not match the Ollama budget.
    const { breaches: claudeBreaches } = service.evaluateBudgetsForCall('claude', 'entity-match');
    expect(claudeBreaches).toHaveLength(0);

    const { breaches: ollamaBreaches } = service.evaluateBudgetsForCall('ollama', 'entity-match');
    expect(ollamaBreaches).toHaveLength(1);
  });
});

describe('migrateLegacyBudgetSettings', () => {
  it('is a no-op when no legacy settings exist', () => {
    service.migrateLegacyBudgetSettings();
    expect(service.listBudgets()).toHaveLength(0);
  });

  it('creates a global budget from ai.monthlyTokenBudget + ai.budgetExceededFallback=skip', () => {
    seedSetting(db, { key: 'ai.monthlyTokenBudget', value: '50000' });
    seedSetting(db, { key: 'ai.budgetExceededFallback', value: 'skip' });

    service.migrateLegacyBudgetSettings();

    const budgets = service.listBudgets();
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.id).toBe('global');
    expect(budgets[0]?.scopeType).toBe('global');
    expect(budgets[0]?.monthlyTokenLimit).toBe(50000);
    expect(budgets[0]?.action).toBe('block');
  });

  it('maps fallback=alert to action=warn', () => {
    seedSetting(db, { key: 'ai.monthlyTokenBudget', value: '20000' });
    seedSetting(db, { key: 'ai.budgetExceededFallback', value: 'alert' });

    service.migrateLegacyBudgetSettings();

    const budgets = service.listBudgets();
    expect(budgets[0]?.action).toBe('warn');
  });

  it('is idempotent — re-running does not duplicate or change the row', () => {
    seedSetting(db, { key: 'ai.monthlyTokenBudget', value: '10000' });
    service.migrateLegacyBudgetSettings();
    expect(service.listBudgets()).toHaveLength(1);

    // Mutate the legacy setting after the first migration; the migration
    // should not re-apply (the `ai.budgetSettingsMigrated` flag gates re-runs).
    setRawSetting('ai.monthlyTokenBudget', '99999');
    service.migrateLegacyBudgetSettings();
    const budgets = service.listBudgets();
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.monthlyTokenLimit).toBe(10000);
  });

  it('does not overwrite an existing global budget row', () => {
    service.upsertBudget({
      id: 'global',
      scopeType: 'global',
      monthlyCostLimit: 5,
      action: 'warn',
    });
    seedSetting(db, { key: 'ai.monthlyTokenBudget', value: '99999' });
    seedSetting(db, { key: 'ai.budgetExceededFallback', value: 'skip' });

    service.migrateLegacyBudgetSettings();
    const budgets = service.listBudgets();
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.monthlyCostLimit).toBe(5);
    expect(budgets[0]?.action).toBe('warn');
  });
});

describe('findFallbackProvider', () => {
  it('returns null when no local provider is configured', () => {
    expect(service.findFallbackProvider()).toBeNull();
  });

  it('returns the first active local provider with its default model', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ai_providers (id, name, type, base_url, api_key_ref, status, created_at, updated_at)
       VALUES (?, ?, 'local', ?, NULL, 'active', ?, ?)`
    ).run('ollama', 'Ollama', 'http://localhost:11434', now, now);
    db.prepare(
      `INSERT INTO ai_model_pricing
         (provider_id, model_id, input_cost_per_mtok, output_cost_per_mtok, is_default, created_at, updated_at)
       VALUES (?, ?, 0, 0, 1, ?, ?)`
    ).run('ollama', 'llama3:8b', now, now);

    const found = service.findFallbackProvider();
    expect(found).toEqual({ provider: 'ollama', model: 'llama3:8b' });
  });

  it('ignores inactive local providers', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ai_providers (id, name, type, base_url, api_key_ref, status, created_at, updated_at)
       VALUES (?, ?, 'local', ?, NULL, 'error', ?, ?)`
    ).run('ollama', 'Ollama', 'http://localhost:11434', now, now);
    db.prepare(
      `INSERT INTO ai_model_pricing
         (provider_id, model_id, input_cost_per_mtok, output_cost_per_mtok, is_default, created_at, updated_at)
       VALUES (?, ?, 0, 0, 1, ?, ?)`
    ).run('ollama', 'llama3:8b', now, now);

    expect(service.findFallbackProvider()).toBeNull();
  });

  it('skips active local providers with no pricing row and returns one that has pricing', () => {
    const now = new Date().toISOString();
    // First active local provider with NO pricing row — under the old LEFT JOIN
    // implementation this row would win the ORDER BY tiebreak and return null.
    db.prepare(
      `INSERT INTO ai_providers (id, name, type, base_url, api_key_ref, status, created_at, updated_at)
       VALUES (?, ?, 'local', ?, NULL, 'active', ?, ?)`
    ).run('orphan', 'Orphan', 'http://localhost:9999', now, now);
    // Second active local provider WITH a pricing row — this is the correct
    // fallback candidate.
    db.prepare(
      `INSERT INTO ai_providers (id, name, type, base_url, api_key_ref, status, created_at, updated_at)
       VALUES (?, ?, 'local', ?, NULL, 'active', ?, ?)`
    ).run('ollama', 'Ollama', 'http://localhost:11434', now, now);
    db.prepare(
      `INSERT INTO ai_model_pricing
         (provider_id, model_id, input_cost_per_mtok, output_cost_per_mtok, is_default, created_at, updated_at)
       VALUES (?, ?, 0, 0, 1, ?, ?)`
    ).run('ollama', 'llama3:8b', now, now);

    expect(service.findFallbackProvider()).toEqual({ provider: 'ollama', model: 'llama3:8b' });
  });
});
