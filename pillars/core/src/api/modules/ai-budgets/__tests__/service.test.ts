/**
 * Tests for the AI budgets service + enforcement helpers (ported from
 * `apps/pops-api/src/modules/core/ai-budgets/service.test.ts`).
 *
 * Runs against an in-memory `core.db` opened per-test via `openCoreDb`.
 * Usage / settings / providers are seeded through the relocated service
 * layer (or raw drizzle for the provider+pricing join) rather than the
 * monolith's `seedAiUsage` / `seedSetting` raw-SQL helpers.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aiModelPricing,
  aiProviders,
  aiUsageService,
  openCoreDb,
  settingsService,
  type CoreDb,
  type OpenedCoreDb,
} from '../../../../db/index.js';
import * as service from '../service.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let db: CoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-budgets-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  db = coreDb.db;
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedUsage(overrides: {
  provider?: string;
  operation?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt?: string;
}): void {
  aiUsageService.createInferenceLog(db, {
    provider: overrides.provider ?? 'claude',
    model: 'claude-haiku-4-5-20251001',
    operation: overrides.operation ?? 'entity-match',
    domain: 'finance',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 20,
    costUsd: overrides.costUsd ?? 0.001,
    latencyMs: 0,
    status: 'success',
    cached: 0,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  });
}

function seedProvider(id: string, status: 'active' | 'error'): void {
  const now = new Date().toISOString();
  db.insert(aiProviders)
    .values({
      id,
      name: id,
      type: 'local',
      baseUrl: 'http://localhost:11434',
      apiKeyRef: null,
      status,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function seedPricing(providerId: string, modelId: string): void {
  const now = new Date().toISOString();
  db.insert(aiModelPricing)
    .values({
      providerId,
      modelId,
      displayName: null,
      inputCostPerMtok: 0,
      outputCostPerMtok: 0,
      contextWindow: null,
      isDefault: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe('getBudgetStatus', () => {
  it('returns empty when no budgets exist', () => {
    expect(service.getBudgetStatus(db)).toHaveLength(0);
  });

  it('returns correct percentageUsed for a cost-limited budget', () => {
    service.upsertBudget(db, { id: 'global', scopeType: 'global', monthlyCostLimit: 10 });
    seedUsage({ costUsd: 2.5, createdAt: new Date().toISOString() });
    seedUsage({ costUsd: 2.5, createdAt: new Date().toISOString() });

    const [status] = service.getBudgetStatus(db);
    expect(status?.percentageUsed).toBeCloseTo(50);
    expect(status?.currentCostUsage).toBeCloseTo(5);
  });

  it('returns correct percentageUsed for a token-limited budget', () => {
    service.upsertBudget(db, { id: 'global', scopeType: 'global', monthlyTokenLimit: 1000 });
    seedUsage({ inputTokens: 300, outputTokens: 200, createdAt: new Date().toISOString() });

    const [status] = service.getBudgetStatus(db);
    expect(status?.percentageUsed).toBeCloseTo(50);
    expect(status?.currentTokenUsage).toBe(500);
  });

  it('percentageUsed is null when no limit is configured', () => {
    service.upsertBudget(db, { id: 'global', scopeType: 'global' });
    seedUsage({ costUsd: 5, createdAt: new Date().toISOString() });

    const [status] = service.getBudgetStatus(db);
    expect(status?.percentageUsed).toBeNull();
    expect(status?.projectedExhaustionDate).toBeNull();
  });

  it('projectedExhaustionDate is null when usage is zero', () => {
    service.upsertBudget(db, { id: 'global', scopeType: 'global', monthlyCostLimit: 100 });

    const [status] = service.getBudgetStatus(db);
    expect(status?.currentCostUsage).toBe(0);
    expect(status?.projectedExhaustionDate).toBeNull();
  });

  it('projectedExhaustionDate is a YYYY-MM-DD string when usage is non-zero', () => {
    service.upsertBudget(db, { id: 'global', scopeType: 'global', monthlyCostLimit: 1000 });
    seedUsage({ costUsd: 10, createdAt: new Date().toISOString() });

    const [status] = service.getBudgetStatus(db);
    expect(status?.projectedExhaustionDate).not.toBeNull();
    expect(status?.projectedExhaustionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('scopes usage to the matching provider for a provider-scoped budget', () => {
    service.upsertBudget(db, {
      id: 'claude-budget',
      scopeType: 'provider',
      scopeValue: 'claude',
      monthlyCostLimit: 10,
    });
    seedUsage({ provider: 'claude', costUsd: 3, createdAt: new Date().toISOString() });
    seedUsage({ provider: 'ollama', costUsd: 5, createdAt: new Date().toISOString() });

    const [status] = service.getBudgetStatus(db);
    expect(status?.currentCostUsage).toBeCloseTo(3);
    expect(status?.percentageUsed).toBeCloseTo(30);
  });

  it('scopes usage to the matching operation for an operation-scoped budget', () => {
    service.upsertBudget(db, {
      id: 'match-budget',
      scopeType: 'operation',
      scopeValue: 'entity-match',
      monthlyTokenLimit: 500,
    });
    seedUsage({
      operation: 'entity-match',
      inputTokens: 100,
      outputTokens: 50,
      createdAt: new Date().toISOString(),
    });
    seedUsage({
      operation: 'nl-query',
      inputTokens: 400,
      outputTokens: 200,
      createdAt: new Date().toISOString(),
    });

    const [status] = service.getBudgetStatus(db);
    expect(status?.currentTokenUsage).toBe(150);
    expect(status?.percentageUsed).toBeCloseTo(30);
  });

  it('cost limit takes priority over token limit when both are set', () => {
    service.upsertBudget(db, {
      id: 'dual',
      scopeType: 'global',
      monthlyCostLimit: 20,
      monthlyTokenLimit: 1000,
    });
    seedUsage({
      costUsd: 4,
      inputTokens: 100,
      outputTokens: 50,
      createdAt: new Date().toISOString(),
    });

    const [status] = service.getBudgetStatus(db);
    expect(status?.percentageUsed).toBeCloseTo(20);
  });
});

describe('evaluateBudgetsForCall', () => {
  it('returns no breaches when no budgets exist', () => {
    const { breaches, allBudgets } = service.evaluateBudgetsForCall(db, 'claude', 'entity-match');
    expect(breaches).toHaveLength(0);
    expect(allBudgets).toHaveLength(0);
  });

  it('identifies a cost breach on a global budget', () => {
    service.upsertBudget(db, {
      id: 'global',
      scopeType: 'global',
      monthlyCostLimit: 1,
      action: 'block',
    });
    seedUsage({ costUsd: 1.1, createdAt: new Date().toISOString() });

    const { breaches } = service.evaluateBudgetsForCall(db, 'claude', 'entity-match');
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.limitType).toBe('cost');
    expect(breaches[0]?.budget.id).toBe('global');
  });

  it('ignores provider-scoped budgets for a different provider', () => {
    service.upsertBudget(db, {
      id: 'ollama-budget',
      scopeType: 'provider',
      scopeValue: 'ollama',
      monthlyCostLimit: 1,
      action: 'block',
    });
    seedUsage({ provider: 'ollama', costUsd: 2, createdAt: new Date().toISOString() });

    const { breaches: claudeBreaches } = service.evaluateBudgetsForCall(
      db,
      'claude',
      'entity-match'
    );
    expect(claudeBreaches).toHaveLength(0);

    const { breaches: ollamaBreaches } = service.evaluateBudgetsForCall(
      db,
      'ollama',
      'entity-match'
    );
    expect(ollamaBreaches).toHaveLength(1);
  });
});

describe('migrateLegacyBudgetSettings', () => {
  it('is a no-op when no legacy settings exist', () => {
    service.migrateLegacyBudgetSettings(db);
    expect(service.listBudgets(db)).toHaveLength(0);
  });

  it('creates a global budget from ai.monthlyTokenBudget + ai.budgetExceededFallback=skip', () => {
    settingsService.setRawSetting(db, 'ai.monthlyTokenBudget', '50000');
    settingsService.setRawSetting(db, 'ai.budgetExceededFallback', 'skip');

    service.migrateLegacyBudgetSettings(db);

    const budgets = service.listBudgets(db);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.id).toBe('global');
    expect(budgets[0]?.scopeType).toBe('global');
    expect(budgets[0]?.monthlyTokenLimit).toBe(50000);
    expect(budgets[0]?.action).toBe('block');
  });

  it('maps fallback=alert to action=warn', () => {
    settingsService.setRawSetting(db, 'ai.monthlyTokenBudget', '20000');
    settingsService.setRawSetting(db, 'ai.budgetExceededFallback', 'alert');

    service.migrateLegacyBudgetSettings(db);

    const budgets = service.listBudgets(db);
    expect(budgets[0]?.action).toBe('warn');
  });

  it('is idempotent — re-running does not duplicate or change the row', () => {
    settingsService.setRawSetting(db, 'ai.monthlyTokenBudget', '10000');
    service.migrateLegacyBudgetSettings(db);
    expect(service.listBudgets(db)).toHaveLength(1);

    settingsService.setRawSetting(db, 'ai.monthlyTokenBudget', '99999');
    service.migrateLegacyBudgetSettings(db);
    const budgets = service.listBudgets(db);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.monthlyTokenLimit).toBe(10000);
  });

  it('does not overwrite an existing global budget row', () => {
    service.upsertBudget(db, {
      id: 'global',
      scopeType: 'global',
      monthlyCostLimit: 5,
      action: 'warn',
    });
    settingsService.setRawSetting(db, 'ai.monthlyTokenBudget', '99999');
    settingsService.setRawSetting(db, 'ai.budgetExceededFallback', 'skip');

    service.migrateLegacyBudgetSettings(db);
    const budgets = service.listBudgets(db);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]?.monthlyCostLimit).toBe(5);
    expect(budgets[0]?.action).toBe('warn');
  });
});

describe('findFallbackProvider', () => {
  it('returns null when no local provider is configured', () => {
    expect(service.findFallbackProvider(db)).toBeNull();
  });

  it('returns the first active local provider with its default model', () => {
    seedProvider('ollama', 'active');
    seedPricing('ollama', 'llama3:8b');

    expect(service.findFallbackProvider(db)).toEqual({ provider: 'ollama', model: 'llama3:8b' });
  });

  it('ignores inactive local providers', () => {
    seedProvider('ollama', 'error');
    seedPricing('ollama', 'llama3:8b');

    expect(service.findFallbackProvider(db)).toBeNull();
  });

  it('skips active local providers with no pricing row and returns one that has pricing', () => {
    seedProvider('orphan', 'active');
    seedProvider('ollama', 'active');
    seedPricing('ollama', 'llama3:8b');

    expect(service.findFallbackProvider(db)).toEqual({ provider: 'ollama', model: 'llama3:8b' });
  });
});
