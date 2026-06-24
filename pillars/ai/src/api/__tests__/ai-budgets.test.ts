/**
 * Integration tests for the `ai-budgets.*` REST surface, driven through the real
 * Express app via supertest: upsert round-trips (including global-scope
 * canonicalisation of `scopeValue` to null), list, and live status
 * (percentage-used + projected-exhaustion) with usage seeded into
 * `ai_inference_log`. Validation 400 is asserted at the contract boundary
 * (bad scopeType / empty id).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiUsageService, openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let aiDb: OpenedAiDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-budgets-rest-test-'));
  aiDb = openAiDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' })
  );
}

function seedUsage(overrides: { provider?: string; costUsd?: number }): void {
  aiUsageService.createInferenceLog(aiDb.db, {
    provider: overrides.provider ?? 'claude',
    model: 'claude-haiku-4-5-20251001',
    operation: 'entity-match',
    domain: 'finance',
    inputTokens: 100,
    outputTokens: 20,
    costUsd: overrides.costUsd ?? 0.001,
    latencyMs: 0,
    status: 'success',
    cached: 0,
    createdAt: new Date().toISOString(),
  });
}

describe('ai-budgets — upsert + list', () => {
  it('creates a budget and reads it back via list', async () => {
    const created = await client().aiBudgets.upsert({
      id: 'global',
      scopeType: 'global',
      monthlyCostLimit: 10,
      action: 'block',
    });
    expect(created.id).toBe('global');
    expect(created.scopeType).toBe('global');
    // Global scope canonicalises scopeValue to null regardless of input.
    expect(created.scopeValue).toBeNull();
    expect(created.monthlyCostLimit).toBe(10);
    expect(created.action).toBe('block');

    const listed = await client().aiBudgets.list();
    expect(listed.map((b) => b.id)).toEqual(['global']);
  });

  it('updates an existing budget in place (upsert keyed by id)', async () => {
    await client().aiBudgets.upsert({ id: 'global', scopeType: 'global', monthlyCostLimit: 5 });
    const updated = await client().aiBudgets.upsert({
      id: 'global',
      scopeType: 'global',
      monthlyCostLimit: 25,
    });
    expect(updated.monthlyCostLimit).toBe(25);

    const listed = await client().aiBudgets.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.monthlyCostLimit).toBe(25);
  });
});

describe('ai-budgets — status', () => {
  it('returns empty when no budgets exist', async () => {
    expect(await client().aiBudgets.getBudgetStatus()).toEqual([]);
  });

  it('computes percentageUsed for a cost-limited budget', async () => {
    await client().aiBudgets.upsert({ id: 'global', scopeType: 'global', monthlyCostLimit: 10 });
    seedUsage({ costUsd: 2.5 });
    seedUsage({ costUsd: 2.5 });

    const [status] = await client().aiBudgets.getBudgetStatus();
    expect(status?.currentCostUsage).toBeCloseTo(5);
    expect(status?.percentageUsed).toBeCloseTo(50);
  });

  it('scopes usage to the matching provider for a provider-scoped budget', async () => {
    await client().aiBudgets.upsert({
      id: 'claude-budget',
      scopeType: 'provider',
      scopeValue: 'claude',
      monthlyCostLimit: 10,
    });
    seedUsage({ provider: 'claude', costUsd: 3 });
    seedUsage({ provider: 'ollama', costUsd: 5 });

    const [status] = await client().aiBudgets.getBudgetStatus();
    expect(status?.currentCostUsage).toBeCloseTo(3);
    expect(status?.percentageUsed).toBeCloseTo(30);
  });
});

describe('ai-budgets — validation', () => {
  it('400s an unknown scopeType at the contract boundary', async () => {
    await expect(
      client().aiBudgets.upsert({ id: 'x', scopeType: 'planet', monthlyCostLimit: 1 })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s an empty id at the contract boundary', async () => {
    await expect(
      client().aiBudgets.upsert({ id: '', scopeType: 'global', monthlyCostLimit: 1 })
    ).rejects.toMatchObject({ status: 400 });
  });
});
