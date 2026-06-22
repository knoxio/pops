/**
 * Integration tests for inventory's federated `/settings/*` surface
 * (settings-federation S2).
 *
 * Boots the production `createInventoryApiApp` factory against a per-test temp
 * `inventory.db` and drives the RU+reset surface over real HTTP via supertest:
 * the `0009_settings_baseline.sql` migration creates the table, `listEffective`
 * resolves manifest defaults, update persists to inventory's OWN database, reset
 * re-applies the default, and a free-form `set-many` addressing an undeclared
 * key is rejected with a 400. Inventory declares no sensitive keys, so reads are
 * not redacted.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inventoryKeyDefaults } from '../../contract/settings/key-defaults.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

function app() {
  return createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-settings-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('inventory federated /settings', () => {
  it('lists every declared key resolved to its manifest default', async () => {
    const res = await request(app()).get('/settings');
    expect(res.status).toBe(200);
    const byKey = new Map<string, string>(
      (res.body.data as { key: string; value: string }[]).map((row) => [row.key, row.value])
    );
    expect(byKey.get('inventory.defaultLimit')).toBe('50');
    expect(byKey.get('inventory.searchDefaultLimit')).toBe('20');
    expect(byKey.get('inventory.maxFileSizeBytes')).toBe('10485760');
  });

  it('round-trips an update through inventory.db and resets to the default', async () => {
    const put = await request(app()).put('/settings/inventory.defaultLimit').send({ value: '99' });
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual({ key: 'inventory.defaultLimit', value: '99' });

    const afterSet = await request(app()).get('/settings/inventory.defaultLimit');
    expect(afterSet.body.data).toEqual({ key: 'inventory.defaultLimit', value: '99' });

    const reset = await request(app()).post('/settings/inventory.defaultLimit/reset');
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ key: 'inventory.defaultLimit', value: '50' });

    const afterReset = await request(app()).get('/settings/inventory.defaultLimit');
    expect(afterReset.body.data).toBeNull();
  });

  it('reset with no keys restores every declared key to its default', async () => {
    await request(app()).put('/settings/inventory.searchDefaultLimit').send({ value: '5' });
    const reset = await request(app()).post('/settings/reset').send({});
    expect(reset.status).toBe(200);
    expect([...reset.body.reset].toSorted()).toEqual([...inventoryKeyDefaults.keys].toSorted());
    expect(reset.body.settings['inventory.searchDefaultLimit']).toBe('20');
  });

  it('rejects a set-many addressing an undeclared key with a 400', async () => {
    const res = await request(app())
      .post('/settings/set-many')
      .send({ entries: [{ key: 'inventory.notAThing', value: 'x' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a single-key write outside the declared enum with a 400', async () => {
    const res = await request(app()).put('/settings/totally.unknown').send({ value: 'x' });
    expect(res.status).toBe(400);
  });
});
