/**
 * Integration tests for the `users.*` REST surface, driven through the real
 * Express app via supertest:
 *   - happy path — a known user URI resolves and the URI is echoed back
 *   - 404 — URI parses but no `user_settings` row exists for the email
 *   - 400 — malformed URI (wrong scheme/pillar/type, missing id, plain string)
 *   - 400 — missing the required `uri` query param at the contract boundary
 *
 * Auth gating is intentionally NOT asserted: REST runs under docker-net trust
 * (non-identity domain), so there is no `ctx.user` to bounce on.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, userSettings, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-users-rest-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app() {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
}

function client() {
  return makeClient(app());
}

function seedUser(email: string): void {
  coreDb.db.insert(userSettings).values({ userEmail: email, key: 'seed', value: '1' }).run();
}

describe('users — URI contract', () => {
  it('resolves a known user URI and echoes the URI back', async () => {
    seedUser('joao@example.com');
    const uri = 'pops://core/user/joao@example.com';

    const res = await client().users.get(uri);

    expect(res).toEqual({ data: { uri } });
  });

  it('404s when the URI parses but no user is seeded', async () => {
    await expect(client().users.get('pops://core/user/nobody@example.com')).rejects.toMatchObject({
      status: 404,
    });
  });

  it.each([
    ['wrong scheme', 'http://core/user/joao@example.com'],
    ['wrong pillar', 'pops://finance/user/joao@example.com'],
    ['wrong type', 'pops://core/entity/joao@example.com'],
    ['empty id', 'pops://core/user/'],
    ['plain string', 'joao@example.com'],
  ])('400s on malformed URI (%s)', async (_label, uri) => {
    await expect(client().users.get(uri)).rejects.toMatchObject({ status: 400 });
  });

  it('400s when the uri query param is missing at the contract boundary', async () => {
    const res = await supertest(app()).get('/users');
    expect(res.status).toBe(400);
  });
});
