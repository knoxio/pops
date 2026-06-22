/**
 * Integration tests for finance's federated `/settings/*` surface
 * (settings-federation S2).
 *
 * Boots the production `createFinanceApiApp` factory against a per-test temp
 * `finance.db` and drives the RU+reset surface over real HTTP via supertest:
 * the `0056_settings_baseline.sql` migration creates the table, `listEffective`
 * resolves manifest defaults, update persists to finance's OWN database, reset
 * re-applies the default, and a free-form `set-many` addressing an undeclared
 * key is rejected with a 400. Finance declares no sensitive keys, so reads are
 * not redacted.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { financeKeyDefaults } from '../../contract/settings/key-defaults.js';
import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

function app() {
  return createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-settings-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('finance federated /settings', () => {
  it('lists every declared key resolved to its manifest default', async () => {
    const res = await request(app()).get('/settings');
    expect(res.status).toBe(200);
    const byKey = new Map<string, string>(
      (res.body.data as { key: string; value: string }[]).map((row) => [row.key, row.value])
    );
    expect(byKey.get('finance.aiCategorizer.model')).toBe('claude-haiku-4-5-20251001');
    expect(byKey.get('finance.aiCategorizer.maxTokens')).toBe('200');
    expect(byKey.get('finance.defaultLimit')).toBe('50');
  });

  it('round-trips an update through finance.db and resets to the default', async () => {
    const put = await request(app()).put('/settings/finance.defaultLimit').send({ value: '99' });
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual({ key: 'finance.defaultLimit', value: '99' });

    const afterSet = await request(app()).get('/settings/finance.defaultLimit');
    expect(afterSet.body.data).toEqual({ key: 'finance.defaultLimit', value: '99' });

    const reset = await request(app()).post('/settings/finance.defaultLimit/reset');
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ key: 'finance.defaultLimit', value: '50' });

    const afterReset = await request(app()).get('/settings/finance.defaultLimit');
    expect(afterReset.body.data).toBeNull();
  });

  it('reset with no keys restores every declared key to its default', async () => {
    await request(app()).put('/settings/finance.aiCategorizer.maxTokens').send({ value: '500' });
    const reset = await request(app()).post('/settings/reset').send({});
    expect(reset.status).toBe(200);
    expect([...reset.body.reset].toSorted()).toEqual([...financeKeyDefaults.keys].toSorted());
    expect(reset.body.settings['finance.aiCategorizer.maxTokens']).toBe('200');
  });

  it('rejects a set-many addressing an undeclared key with a 400', async () => {
    const res = await request(app())
      .post('/settings/set-many')
      .send({ entries: [{ key: 'finance.notAThing', value: 'x' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a single-key write outside the declared enum with a 400', async () => {
    const res = await request(app()).put('/settings/totally.unknown').send({ value: 'x' });
    expect(res.status).toBe(400);
  });
});
