/**
 * Integration tests for cerebrum's federated `/settings/*` surface
 * (settings-federation S2).
 *
 * Boots the production `createCerebrumApiApp` factory against a per-test temp
 * `cerebrum.db` and drives the RU+reset surface over real HTTP via supertest:
 * the `0057_settings_baseline.sql` migration creates the table, `listEffective`
 * resolves manifest defaults across BOTH the `cerebrum.*` and `ego.*` key
 * spaces, update persists to cerebrum's OWN database, reset re-applies the
 * default, and a free-form `set-many` addressing an undeclared key is rejected
 * with a 400. Cerebrum declares no sensitive keys, so reads are not redacted.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cerebrumKeyDefaults } from '../../contract/settings/key-defaults.js';
import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeEmptyPeerClients, makeReflexService, makeTemplateRegistry } from './test-utils.js';

import type { TemplateRegistry } from '../modules/templates/registry.js';

let tmpDir: string;
let engramRoot: string;
let templateRegistry: TemplateRegistry;
let cerebrumDb: OpenedCerebrumDb;

function app() {
  return createCerebrumApiApp({
    cerebrumDb,
    templateRegistry,
    engramRoot,
    reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3007',
    peerClients: makeEmptyPeerClients(),
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-settings-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-settings-root-'));
  templateRegistry = makeTemplateRegistry();
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

describe('cerebrum federated /settings', () => {
  it('lists every declared key (cerebrum + ego) resolved to its manifest default', async () => {
    const res = await request(app()).get('/settings');
    expect(res.status).toBe(200);
    const byKey = new Map<string, string>(
      (res.body.data as { key: string; value: string }[]).map((row) => [row.key, row.value])
    );
    expect(byKey.get('cerebrum.query.maxSources')).toBe('10');
    expect(byKey.get('cerebrum.captureHotkey')).toBe('c');
    expect(byKey.get('ego.defaultModel')).toBe('claude-sonnet-4-6');
    expect(byKey.get('ego.chat.temperature')).toBe('0.3');
  });

  it('round-trips an update through cerebrum.db and resets to the default', async () => {
    const put = await request(app()).put('/settings/ego.maxHistory').send({ value: '99' });
    expect(put.status).toBe(200);
    expect(put.body.data).toEqual({ key: 'ego.maxHistory', value: '99' });

    const afterSet = await request(app()).get('/settings/ego.maxHistory');
    expect(afterSet.body.data).toEqual({ key: 'ego.maxHistory', value: '99' });

    const reset = await request(app()).post('/settings/ego.maxHistory/reset');
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ key: 'ego.maxHistory', value: '20' });

    const afterReset = await request(app()).get('/settings/ego.maxHistory');
    expect(afterReset.body.data).toBeNull();
  });

  it('reset with no keys restores every declared key to its default', async () => {
    await request(app()).put('/settings/cerebrum.query.maxSources').send({ value: '3' });
    const reset = await request(app()).post('/settings/reset').send({});
    expect(reset.status).toBe(200);
    expect([...reset.body.reset].toSorted()).toEqual([...cerebrumKeyDefaults.keys].toSorted());
    expect(reset.body.settings['cerebrum.query.maxSources']).toBe('10');
  });

  it('rejects a set-many addressing an undeclared key with a 400', async () => {
    const res = await request(app())
      .post('/settings/set-many')
      .send({ entries: [{ key: 'cerebrum.notAThing', value: 'x' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a single-key write outside the declared enum with a 400', async () => {
    const res = await request(app()).put('/settings/totally.unknown').send({ value: 'x' });
    expect(res.status).toBe(400);
  });
});
