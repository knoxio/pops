/**
 * Integration tests for `cerebrum.reflex.*` over REST (PRD-089).
 *
 * Boots the app against a per-test temp `cerebrum.db` plus a temp
 * `reflexes.toml` fixture, exercising list/get/enable/disable/test/history.
 * One suite uses the no-config (missing-file) path to prove the pillar boots
 * to an empty reflex set.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, reflexExecutions, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

const FIXTURE_TOML = `
[[reflex]]
name = "prune-stale"
description = "Prune stale work notes"
enabled = true
[reflex.trigger]
type = "threshold"
metric = "staleness_max"
value = 30
[reflex.action]
type = "glia"
verb = "prune"

[[reflex]]
name = "classify-on-create"
description = "Classify new captures"
enabled = false
[reflex.trigger]
type = "event"
event = "engram.created"
[reflex.action]
type = "ingest"
verb = "classify"
`;

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
let configPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-reflex-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  configPath = join(tmpDir, 'reflexes.toml');
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function clientWith(toml: string | null) {
  if (toml !== null) writeFileSync(configPath, toml, 'utf8');
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      reflexService: makeReflexService(cerebrumDb.db, configPath),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

function seedExecution(reflexName: string, triggeredAt: string): void {
  cerebrumDb.db
    .insert(reflexExecutions)
    .values({
      id: `rex_${reflexName}_${triggeredAt}`,
      reflexName,
      triggerType: 'threshold',
      triggerData: JSON.stringify({ metric: 'staleness_max', value: 31 }),
      actionType: 'glia',
      actionVerb: 'prune',
      status: 'completed',
      result: null,
      triggeredAt,
      completedAt: triggeredAt,
    })
    .run();
}

describe('GET /reflex', () => {
  it('boots to an empty set when no TOML is present', async () => {
    const { reflexes } = await clientWith(null).reflex.list();
    expect(reflexes).toEqual([]);
  });

  it('lists reflexes from the fixture with enriched runtime status', async () => {
    const { reflexes } = await clientWith(FIXTURE_TOML).reflex.list();
    const names = reflexes.map((r) => r.name).toSorted();
    expect(names).toEqual(['classify-on-create', 'prune-stale']);
    for (const r of reflexes) {
      expect(r).toHaveProperty('executionCount', 0);
      expect(r).toHaveProperty('lastExecutionAt', null);
    }
  });
});

describe('GET /reflex/:name', () => {
  it('returns a reflex with its execution history', async () => {
    seedExecution('prune-stale', '2026-01-01T00:00:00.000Z');
    const { reflex, history } = await clientWith(FIXTURE_TOML).reflex.get('prune-stale');
    expect(reflex.name).toBe('prune-stale');
    expect(reflex.executionCount).toBe(1);
    expect(reflex.lastExecutionAt).toBe('2026-01-01T00:00:00.000Z');
    expect(history).toHaveLength(1);
    expect(history[0]?.status).toBe('completed');
  });

  it('404s on an unknown reflex', async () => {
    await expect(clientWith(FIXTURE_TOML).reflex.get('nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('POST /reflex/:name/{enable,disable}', () => {
  it('round-trips the enabled flag through the TOML', async () => {
    const client = clientWith(FIXTURE_TOML);

    const disabled = await client.reflex.disable('prune-stale');
    expect(disabled.success).toBe(true);
    const afterDisable = await client.reflex.list();
    expect(afterDisable.reflexes.find((r) => r.name === 'prune-stale')?.enabled).toBe(false);

    const enabled = await client.reflex.enable('classify-on-create');
    expect(enabled.success).toBe(true);
    const afterEnable = await client.reflex.list();
    expect(afterEnable.reflexes.find((r) => r.name === 'classify-on-create')?.enabled).toBe(true);
  });

  it('404s when toggling an unknown reflex', async () => {
    await expect(clientWith(FIXTURE_TOML).reflex.enable('nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('POST /reflex/:name/test', () => {
  it('logs a completed dry-run execution', async () => {
    const client = clientWith(FIXTURE_TOML);
    const { result } = await client.reflex.test('prune-stale');
    expect(result?.status).toBe('completed');
    expect(result?.result).toMatchObject({ dryRun: true, wouldExecute: 'glia:prune' });

    const { total } = await client.reflex.history({ name: 'prune-stale' });
    expect(total).toBe(1);
  });
});

describe('POST /reflex/history', () => {
  it('paginates the execution log newest-first', async () => {
    seedExecution('prune-stale', '2026-01-01T00:00:00.000Z');
    seedExecution('prune-stale', '2026-01-02T00:00:00.000Z');
    seedExecution('prune-stale', '2026-01-03T00:00:00.000Z');
    const client = clientWith(FIXTURE_TOML);

    const page1 = await client.reflex.history({ limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.executions).toHaveLength(2);
    expect(page1.executions[0]?.triggeredAt).toBe('2026-01-03T00:00:00.000Z');
    expect(page1.executions[1]?.triggeredAt).toBe('2026-01-02T00:00:00.000Z');

    const page2 = await client.reflex.history({ limit: 2, offset: 2 });
    expect(page2.executions).toHaveLength(1);
    expect(page2.executions[0]?.triggeredAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('filters by status', async () => {
    seedExecution('prune-stale', '2026-01-01T00:00:00.000Z');
    const client = clientWith(FIXTURE_TOML);
    const completed = await client.reflex.history({ status: 'completed' });
    expect(completed.total).toBe(1);
    const failed = await client.reflex.history({ status: 'failed' });
    expect(failed.total).toBe(0);
  });
});
