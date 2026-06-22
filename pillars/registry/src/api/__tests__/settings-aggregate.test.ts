/**
 * Integration tests for `GET /settings/aggregate` (settings-federation S3),
 * driven through the real Express app via supertest.
 *
 * Coverage:
 *   - Route ordering: `/settings/aggregate` resolves to the aggregator, not
 *     captured as the `:key` path-param of `GET /settings/:key`.
 *   - Identity gating (`core.settings.aggregate`): 401 anon; service account
 *     with the scope passes; without it 401.
 *   - In-process self read: core's own effective settings appear in the
 *     aggregate even with an empty registry (no remote fan-out).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient, type ClientHeaders } from './test-utils.js';

const CORE_DEFAULT_LIMIT = 'core.defaultLimit';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-settings-aggregate-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
}

function client(headers?: ClientHeaders) {
  return makeClient(app(), headers);
}

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

describe('GET /settings/aggregate', () => {
  it('resolves to the aggregator, not captured as the :key route', async () => {
    const res = await client().settings.aggregate();
    expect(Array.isArray(res.pillars)).toBe(true);
    expect(typeof res.fetchedAt).toBe('string');
  });

  it('includes registry read in-process even with an empty registry (no remote pillars)', async () => {
    await client().settings.set(CORE_DEFAULT_LIMIT, '12');

    const res = await client().settings.aggregate();
    const core = res.pillars.find((p) => p.pillarId === 'registry');

    expect(core).toBeDefined();
    expect(core?.error).toBeUndefined();
    expect(core?.settings.find((s) => s.key === CORE_DEFAULT_LIMIT)?.value).toBe('12');
  });

  it('resolves the manifest default for an unset core key in the aggregate', async () => {
    const res = await client().settings.aggregate();
    const core = res.pillars.find((p) => p.pillarId === 'registry');
    expect(core?.settings.find((s) => s.key === CORE_DEFAULT_LIMIT)?.value).toBe('50');
  });

  it('401s an anonymous caller (production identity, no principal)', async () => {
    await withProdIdentity(async () => {
      await expect(client().settings.aggregate()).rejects.toMatchObject({ status: 401 });
    });
  });

  it('401s a service account whose scopes do not cover core.settings', async () => {
    const created = await client().serviceAccounts.create({
      name: 'aggregate-scopeless-bot',
      scopes: ['cerebrum.query'],
    });
    const scoped = client({ 'x-api-key': created.plaintextKey });
    await expect(scoped.settings.aggregate()).rejects.toMatchObject({ status: 401 });
  });

  it('lets a service account WITH the core.settings scope read the aggregate', async () => {
    const created = await client().serviceAccounts.create({
      name: 'aggregate-bot',
      scopes: ['core.settings'],
    });
    const scoped = client({ 'x-api-key': created.plaintextKey });
    const res = await scoped.settings.aggregate();
    expect(res.pillars.some((p) => p.pillarId === 'registry')).toBe(true);
  });
});
