/**
 * Integration tests for the `service-accounts.*` REST surface (admin
 * CLI/MCP), driven through the real Express app via supertest.
 *
 * Coverage:
 *   - mint → list → revoke happy path (dev-fallback user).
 *   - Error mapping: 400 (duplicate name / zod boundary), 404 (unknown
 *     revoke), 409 (double revoke).
 *   - `userOnly` gating: 401 for an anonymous caller AND for a service-
 *     account principal (even one holding the matching scope) — a machine
 *     principal must never mint or revoke other machine principals.
 *
 * The auth-negative anonymous case forces the production identity branch so
 * the no-principal path is reachable; the service-account case presents a
 * real minted key (resolved as a service-account principal in non-prod).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient, type ClientHeaders } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-sa-rest-test-'));
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

describe('service-accounts REST — admin happy path (dev-fallback user)', () => {
  it('mints, lists, then revokes a service account', async () => {
    const created = await client().serviceAccounts.create({
      name: 'moltbot',
      scopes: ['cerebrum.ingest', 'cerebrum.query'],
    });
    expect(created.plaintextKey).toMatch(/^pops_sa_/);
    expect(created.createdBy).toBe('dev@example.com');
    expect(created.scopes).toEqual(['cerebrum.ingest', 'cerebrum.query']);

    const list = await client().serviceAccounts.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('moltbot');

    const ack = await client().serviceAccounts.revoke(created.id);
    expect(ack).toEqual({ ok: true });

    const after = await client().serviceAccounts.list();
    expect(after[0]?.revokedAt).not.toBeNull();
  });
});

describe('service-accounts REST — error mapping', () => {
  it('400s a duplicate name', async () => {
    await client().serviceAccounts.create({ name: 'dup', scopes: ['core.shell'] });
    await expect(
      client().serviceAccounts.create({ name: 'dup', scopes: ['core.shell'] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s malformed input at the zod boundary (too short / spaces / empty scopes)', async () => {
    await expect(
      client().serviceAccounts.create({ name: 'X', scopes: ['core.shell'] })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      client().serviceAccounts.create({ name: 'has spaces', scopes: ['core.shell'] })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      client().serviceAccounts.create({ name: 'no-scopes', scopes: [] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('404s an unknown revoke target', async () => {
    await expect(client().serviceAccounts.revoke('sa_does-not-exist')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('409s a second revoke of the same account', async () => {
    const created = await client().serviceAccounts.create({
      name: 'double-revoke',
      scopes: ['cerebrum.query'],
    });
    await client().serviceAccounts.revoke(created.id);
    await expect(client().serviceAccounts.revoke(created.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('service-accounts REST — userOnly gating', () => {
  it('401s an anonymous caller (production identity, no principal)', async () => {
    await withProdIdentity(async () => {
      await expect(client().serviceAccounts.list()).rejects.toMatchObject({ status: 401 });
      await expect(
        client().serviceAccounts.create({ name: 'nope', scopes: ['core.shell'] })
      ).rejects.toMatchObject({ status: 401 });
      await expect(client().serviceAccounts.revoke('sa_x')).rejects.toMatchObject({ status: 401 });
    });
  });

  it('401s a service-account principal even with the matching scope granted', async () => {
    // Mint via the dev-fallback user, then present the key — now the caller
    // is a service-account principal (user === null). userOnly must refuse
    // it regardless of scope: the admin surface is human-only.
    const created = await client().serviceAccounts.create({
      name: 'self-mint',
      scopes: ['core.serviceAccounts'],
    });
    const machine = client({ 'x-api-key': created.plaintextKey });
    await expect(machine.serviceAccounts.list()).rejects.toMatchObject({ status: 401 });
    await expect(
      machine.serviceAccounts.create({ name: 'spawn', scopes: ['core.shell'] })
    ).rejects.toMatchObject({ status: 401 });
    await expect(machine.serviceAccounts.revoke(created.id)).rejects.toMatchObject({ status: 401 });
  });
});
