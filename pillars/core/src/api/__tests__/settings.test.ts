/**
 * Integration tests for the `settings.*` REST surface (PRD-247 cross-pillar
 * primitive), driven through the real Express app via supertest.
 *
 * Coverage:
 *   - Every procedure (`get`/`set`/`ensure`/`delete`/`getMany`/`setMany`).
 *   - `getMany` Record-omitted semantics (missing keys absent, not null).
 *   - `setMany` transactional mirror.
 *   - Error mapping: 404 (delete miss), 400 (zod boundary).
 *   - Auth gating (`protected`): 401 for an anonymous caller and for a
 *     service account lacking the scope; 200 for a service account WITH the
 *     scope; the dev-fallback user passes by default.
 *
 * The auth-negative cases force the production identity branch (no dev
 * fallback) so the anonymous path is actually reachable.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SETTINGS_KEYS } from '@pops/types';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient, type ClientHeaders } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-settings-rest-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const PLEX_TOKEN_KEY = SETTINGS_KEYS.PLEX_TOKEN;
const PLEX_USERNAME_KEY = SETTINGS_KEYS.PLEX_USERNAME;
const PLEX_URL_KEY = SETTINGS_KEYS.PLEX_URL;

function app(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
}

function client(headers?: ClientHeaders) {
  return makeClient(app(), headers);
}

/**
 * Run `fn` with the env forced into the production identity branch — no dev
 * fallback, Cloudflare team configured but no JWT presented — so the
 * anonymous (401) path is actually reachable. Restores the prior env after.
 */
async function withProdIdentity(fn: () => Promise<void>): Promise<void> {
  const prevNodeEnv = process.env['NODE_ENV'];
  const prevTeam = process.env['CLOUDFLARE_ACCESS_TEAM_NAME'];
  process.env['NODE_ENV'] = 'production';
  process.env['CLOUDFLARE_ACCESS_TEAM_NAME'] = 'pops-test-team';
  try {
    await fn();
  } finally {
    if (prevNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = prevNodeEnv;
    if (prevTeam === undefined) delete process.env['CLOUDFLARE_ACCESS_TEAM_NAME'];
    else process.env['CLOUDFLARE_ACCESS_TEAM_NAME'] = prevTeam;
  }
}

describe('settings REST — happy paths (dev-fallback user)', () => {
  it('set then get round-trips a single setting', async () => {
    const setRes = await client().settings.set(PLEX_TOKEN_KEY, 'tok-1');
    expect(setRes.data).toEqual({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
    expect(setRes.message).toBe('Setting saved');

    const got = await client().settings.get(PLEX_TOKEN_KEY);
    expect(got.data).toEqual({ key: PLEX_TOKEN_KEY, value: 'tok-1' });
  });

  it('get returns { data: null } for a missing key', async () => {
    const got = await client().settings.get(PLEX_TOKEN_KEY);
    expect(got.data).toBeNull();
  });

  it('set overwrites an existing value', async () => {
    await client().settings.set(PLEX_TOKEN_KEY, 'tok-1');
    const res = await client().settings.set(PLEX_TOKEN_KEY, 'tok-2');
    expect(res.data.value).toBe('tok-2');
    const got = await client().settings.get(PLEX_TOKEN_KEY);
    expect(got.data?.value).toBe('tok-2');
  });

  it('ensure is write-once — second call returns the persisted row unchanged', async () => {
    const first = await client().settings.ensure(PLEX_TOKEN_KEY, 'seed-1');
    expect(first.data).toEqual({ key: PLEX_TOKEN_KEY, value: 'seed-1' });
    const second = await client().settings.ensure(PLEX_TOKEN_KEY, 'would-overwrite');
    expect(second.data.value).toBe('seed-1');
  });

  it('delete removes an existing key', async () => {
    await client().settings.set(PLEX_TOKEN_KEY, 'tok-1');
    const res = await client().settings.delete(PLEX_TOKEN_KEY);
    expect(res.message).toBe('Setting deleted');
    const after = await client().settings.get(PLEX_TOKEN_KEY);
    expect(after.data).toBeNull();
  });
});

describe('settings REST — getMany Record-omitted semantics', () => {
  it('returns every present key and OMITS missing ones (not null-filled)', async () => {
    await client().settings.set(PLEX_TOKEN_KEY, 'tok-1');
    await client().settings.set(PLEX_USERNAME_KEY, 'alice');

    const res = await client().settings.getMany([PLEX_TOKEN_KEY, PLEX_USERNAME_KEY, PLEX_URL_KEY]);
    expect(res.settings).toEqual({ [PLEX_TOKEN_KEY]: 'tok-1', [PLEX_USERNAME_KEY]: 'alice' });
    expect(PLEX_URL_KEY in res.settings).toBe(false);
  });

  it('returns {} for an empty keys array', async () => {
    const res = await client().settings.getMany([]);
    expect(res.settings).toEqual({});
  });

  it('returns {} when no requested key exists', async () => {
    const res = await client().settings.getMany([PLEX_TOKEN_KEY, PLEX_USERNAME_KEY]);
    expect(res.settings).toEqual({});
  });
});

describe('settings REST — setMany transactional batch write', () => {
  it('writes every entry and returns the mirror; readable via getMany', async () => {
    const res = await client().settings.setMany([
      { key: PLEX_TOKEN_KEY, value: 'tok-1' },
      { key: PLEX_USERNAME_KEY, value: 'alice' },
    ]);
    expect(res.settings).toEqual({ [PLEX_TOKEN_KEY]: 'tok-1', [PLEX_USERNAME_KEY]: 'alice' });

    const read = await client().settings.getMany([PLEX_TOKEN_KEY, PLEX_USERNAME_KEY]);
    expect(read.settings).toEqual({ [PLEX_TOKEN_KEY]: 'tok-1', [PLEX_USERNAME_KEY]: 'alice' });
  });

  it('returns {} for an empty entries array', async () => {
    const res = await client().settings.setMany([]);
    expect(res.settings).toEqual({});
  });

  it('overwrites pre-existing keys inside the batch', async () => {
    await client().settings.set(PLEX_TOKEN_KEY, 'old');
    const res = await client().settings.setMany([
      { key: PLEX_TOKEN_KEY, value: 'new' },
      { key: PLEX_USERNAME_KEY, value: 'alice' },
    ]);
    expect(res.settings[PLEX_TOKEN_KEY]).toBe('new');
    expect(res.settings[PLEX_USERNAME_KEY]).toBe('alice');
  });
});

describe('settings REST — error mapping', () => {
  it('404s a delete of a missing key', async () => {
    await expect(client().settings.delete(PLEX_TOKEN_KEY)).rejects.toMatchObject({ status: 404 });
  });

  it('400s an unknown key at the contract boundary (single-key route)', async () => {
    await expect(client().settings.get('not-a-real-key')).rejects.toMatchObject({ status: 400 });
  });

  it('400s a malformed getMany payload (keys not an array)', async () => {
    // Bypass the typed client to send an off-contract body shape.
    const res = await request(app()).post('/settings/get-many').send({ keys: 'not-an-array' });
    expect(res.status).toBe(400);
  });
});

describe('settings REST — auth gating (protected)', () => {
  it('401s an anonymous caller (production identity, no principal) on read and write', async () => {
    await withProdIdentity(async () => {
      await expect(client().settings.get(PLEX_TOKEN_KEY)).rejects.toMatchObject({ status: 401 });
      await expect(client().settings.set(PLEX_TOKEN_KEY, 'x')).rejects.toMatchObject({
        status: 401,
      });
      await expect(client().settings.getMany([PLEX_TOKEN_KEY])).rejects.toMatchObject({
        status: 401,
      });
      await expect(
        client().settings.setMany([{ key: PLEX_TOKEN_KEY, value: 'x' }])
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  it('401s a service account whose scopes do not cover core.settings', async () => {
    // Mint a real service account with an unrelated scope, then present its key.
    // In non-prod the x-api-key branch resolves a genuine service-account
    // principal (it runs BEFORE the dev fallback), so the scope gate is the
    // only thing standing between the caller and the data.
    const created = await client().serviceAccounts.create({
      name: 'scopeless-bot',
      scopes: ['cerebrum.query'],
    });
    const scoped = client({ 'x-api-key': created.plaintextKey });
    await expect(scoped.settings.get(PLEX_TOKEN_KEY)).rejects.toMatchObject({ status: 401 });
    await expect(scoped.settings.set(PLEX_TOKEN_KEY, 'x')).rejects.toMatchObject({ status: 401 });
  });

  it('lets a service account WITH the core.settings scope read and write', async () => {
    const created = await client().serviceAccounts.create({
      name: 'settings-bot',
      scopes: ['core.settings'],
    });
    const scoped = client({ 'x-api-key': created.plaintextKey });

    const setRes = await scoped.settings.set(PLEX_TOKEN_KEY, 'sa-tok');
    expect(setRes.data.value).toBe('sa-tok');

    const got = await scoped.settings.get(PLEX_TOKEN_KEY);
    expect(got.data?.value).toBe('sa-tok');
  });
});
