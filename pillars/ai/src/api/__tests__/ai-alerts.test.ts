/**
 * Integration tests for the `ai-alerts.*` REST surface, driven through the real
 * Express app via supertest, across the nested rule CRUD + seeding, fired-alert
 * listing/acknowledgement, and the evaluation trigger:
 *   - rules: create → get → list → update → setEnabled → delete, seedDefaults
 *   - rules.get / acknowledge 404 on unknown id
 *   - the literal `/rules/seed-defaults` route wins over `/rules/:id`
 *   - list fired alerts with the acknowledged filter (string-coerced boolean)
 *   - runNow returns evaluation counters (no rules → no dispatch, no network)
 *   - validation 400 at the contract boundary (bad type, non-positive threshold)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiAlerts, openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let aiDb: OpenedAiDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-alerts-rest-test-'));
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

function seedAlert(
  overrides: { acknowledged?: number; severity?: 'warning' | 'critical' } = {}
): number {
  const now = new Date().toISOString();
  const [row] = aiDb.db
    .insert(aiAlerts)
    .values({
      ruleId: null,
      type: 'error-spike',
      message: 'error rate exceeded',
      severity: overrides.severity ?? 'critical',
      scopeDetail: null,
      metricValue: 42,
      thresholdValue: 10,
      acknowledged: overrides.acknowledged ?? 0,
      acknowledgedAt: null,
      createdAt: now,
    })
    .returning()
    .all();
  return row!.id;
}

describe('ai-alerts — rule CRUD', () => {
  it('creates, gets, lists, updates, toggles, and deletes a rule', async () => {
    const created = await client().aiAlerts.rules.create({
      type: 'error-spike',
      thresholdValue: 10,
      windowMinutes: 60,
    });
    expect(created.id).toBeGreaterThan(0);
    expect(created.type).toBe('error-spike');
    expect(created.enabled).toBe(true);

    const fetched = await client().aiAlerts.rules.get(created.id);
    expect(fetched.id).toBe(created.id);

    const listed = await client().aiAlerts.rules.list();
    expect(listed.map((r) => r.id)).toContain(created.id);

    const updated = await client().aiAlerts.rules.update(created.id, { thresholdValue: 25 });
    expect(updated.thresholdValue).toBe(25);

    const toggled = await client().aiAlerts.rules.setEnabled(created.id, false);
    expect(toggled.enabled).toBe(false);

    const deleted = await client().aiAlerts.rules.delete(created.id);
    expect(deleted.success).toBe(true);

    const afterDelete = await client().aiAlerts.rules.list();
    expect(afterDelete.map((r) => r.id)).not.toContain(created.id);
  });

  it('404s get on an unknown rule id', async () => {
    await expect(client().aiAlerts.rules.get(99999)).rejects.toMatchObject({ status: 404 });
  });

  it('seedDefaults inserts the default rule set and is idempotent', async () => {
    const first = await client().aiAlerts.rules.seedDefaults();
    expect(first.created).toBe(3);

    const second = await client().aiAlerts.rules.seedDefaults();
    expect(second.created).toBe(0);

    const rules = await client().aiAlerts.rules.list();
    expect(rules.map((r) => r.type).toSorted()).toEqual([
      'budget-threshold',
      'error-spike',
      'latency-degradation',
    ]);
  });
});

describe('ai-alerts — validation', () => {
  it('400s an unknown rule type at the contract boundary', async () => {
    await expect(
      client().aiAlerts.rules.create({ type: 'meltdown', thresholdValue: 1 })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s a non-positive threshold at the contract boundary', async () => {
    await expect(
      client().aiAlerts.rules.create({ type: 'error-spike', thresholdValue: 0 })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('ai-alerts — fired alerts', () => {
  it('lists fired alerts with a total count', async () => {
    seedAlert();
    seedAlert({ acknowledged: 1 });

    const all = await client().aiAlerts.list();
    expect(all.total).toBe(2);
    expect(all.alerts).toHaveLength(2);
  });

  it('filters by the acknowledged flag (string-coerced boolean)', async () => {
    seedAlert({ acknowledged: 0 });
    seedAlert({ acknowledged: 1 });

    const open = await client().aiAlerts.list({ acknowledged: 'false' });
    expect(open.total).toBe(1);
    expect(open.alerts[0]?.acknowledged).toBe(false);

    const closed = await client().aiAlerts.list({ acknowledged: 'true' });
    expect(closed.total).toBe(1);
    expect(closed.alerts[0]?.acknowledged).toBe(true);
  });

  it('acknowledges a fired alert', async () => {
    const id = seedAlert({ acknowledged: 0 });

    const acked = await client().aiAlerts.acknowledge(id);
    expect(acked.id).toBe(id);
    expect(acked.acknowledged).toBe(true);
    expect(acked.acknowledgedAt).not.toBeNull();
  });

  it('404s acknowledge on an unknown alert id', async () => {
    await expect(client().aiAlerts.acknowledge(99999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('ai-alerts — runNow', () => {
  it('runs an evaluation cycle and returns counters (no rules → nothing fires)', async () => {
    const result = await client().aiAlerts.runNow();
    expect(result.rulesEvaluated).toBe(0);
    expect(result.candidates).toBe(0);
    expect(result.deduped).toBe(0);
    expect(result.alerts).toEqual([]);
  });
});
