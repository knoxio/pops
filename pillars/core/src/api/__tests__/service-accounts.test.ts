/**
 * Integration tests for the migrated `core.serviceAccounts.*` tRPC
 * surface inside pops-core-api (Phase 5 PR 1 / Track M1).
 *
 * Two layers of coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory core.db. Asserts the same shape contract the
 *      legacy pops-api router enforced (mint → list → revoke flow, then
 *      duplicate-name → BAD_REQUEST, unknown revoke → NOT_FOUND, double
 *      revoke → CONFLICT, scope enforcement for service-account callers).
 *
 *   2. HTTP wire smoke — boots the Express app via `createCoreApiApp`
 *      and round-trips one mutation over `/trpc` with supertest. Proves
 *      `createExpressMiddleware` is wired up, the context factory reads
 *      `X-API-Key` headers, and the user-only gate kicks in.
 *
 * Service-layer invariants (CRUD, FIFO, key hashing) already live in
 * `packages/core-db/src/__tests__/` — duplicating them here would just
 * test drizzle.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-sa-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function userCaller(email = 'admin@example.com'): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email },
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

function serviceAccountCaller(scopes: string[]): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: { id: 'sa_test', name: 'test-sa', scopes },
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

describe('core.serviceAccounts admin (tRPC caller)', () => {
  it('lets a human admin mint, list, then revoke a service account', async () => {
    const admin = userCaller();
    const created = await admin.core.serviceAccounts.create({
      name: 'moltbot',
      scopes: ['cerebrum.ingest', 'cerebrum.query'],
    });
    expect(created.plaintextKey).toMatch(/^pops_sa_/);
    expect(created.createdBy).toBe('admin@example.com');

    const list = await admin.core.serviceAccounts.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('moltbot');

    const ack = await admin.core.serviceAccounts.revoke({ id: created.id });
    expect(ack).toEqual({ ok: true });

    const after = await admin.core.serviceAccounts.list();
    const [revoked] = after;
    if (!revoked) throw new Error('expected the revoked row to be returned');
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('rejects service-account callers from the admin endpoints', async () => {
    const sa = serviceAccountCaller(['core.serviceAccounts']);
    await expect(
      sa.core.serviceAccounts.create({ name: 'self-mint', scopes: ['core.shell'] })
    ).rejects.toThrow(TRPCError);
    await expect(sa.core.serviceAccounts.list()).rejects.toThrow(TRPCError);
    await expect(sa.core.serviceAccounts.revoke({ id: 'sa_x' })).rejects.toThrow(TRPCError);
  });

  it('rejects when no principal is present', async () => {
    const anon = anonCaller();
    await expect(anon.core.serviceAccounts.list()).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects duplicate names with a BAD_REQUEST tRPC error', async () => {
    const admin = userCaller();
    await admin.core.serviceAccounts.create({ name: 'dup', scopes: ['core.shell'] });
    await expect(
      admin.core.serviceAccounts.create({ name: 'dup', scopes: ['core.shell'] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
      cause: expect.objectContaining({ name: 'ValidationError' }),
    });
  });

  it('rejects unknown revoke targets with a NOT_FOUND tRPC error', async () => {
    const admin = userCaller();
    await expect(
      admin.core.serviceAccounts.revoke({ id: 'sa_does-not-exist' })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
      cause: expect.objectContaining({ name: 'NotFoundError' }),
    });
  });

  it('rejects a second revoke with a CONFLICT tRPC error', async () => {
    const admin = userCaller();
    const created = await admin.core.serviceAccounts.create({
      name: 'double-revoke',
      scopes: ['cerebrum.query'],
    });
    await admin.core.serviceAccounts.revoke({ id: created.id });
    await expect(admin.core.serviceAccounts.revoke({ id: created.id })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'CONFLICT',
      cause: expect.objectContaining({ statusCode: 409 }),
    });
  });

  it('rejects malformed input at the zod boundary', async () => {
    const admin = userCaller();
    await expect(
      admin.core.serviceAccounts.create({ name: 'X', scopes: ['core.shell'] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
    await expect(
      admin.core.serviceAccounts.create({ name: 'has spaces', scopes: ['core.shell'] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
    await expect(
      admin.core.serviceAccounts.create({ name: 'no-scopes', scopes: [] })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
  });
});

describe('/trpc HTTP surface', () => {
  function makeApp(): ReturnType<typeof createCoreApiApp> {
    return createCoreApiApp({
      coreDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3001',
    });
  }

  it('answers core.serviceAccounts.list over HTTP (dev context auto-authenticates)', async () => {
    const app = makeApp();
    const res = await request(app).get('/trpc/core.serviceAccounts.list');
    expect(res.status).toBe(200);
    expect(res.body.result.data).toEqual([]);
  });

  it('does not crash when handed a well-shaped X-API-Key that matches no DB row', async () => {
    const app = makeApp();
    // A header that passes parseApiKey but does not match any DB row leaves
    // ctx.serviceAccount === null. In production that would land in the
    // anonymous branch and bounce as UNAUTHORIZED; in this test context
    // NODE_ENV !== 'production' so the dev-user fallback authenticates
    // the caller as a human — which is the only path that admin endpoints
    // accept anyway. The negative we actually want to lock in here is
    // "well-shaped key for an unknown prefix never crashes the request
    // pipeline" — i.e. a clean 200, not a 500.
    const res = await request(app)
      .get('/trpc/core.serviceAccounts.list')
      .set('X-API-Key', 'pops_sa_abcdefgh.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(res.status).toBe(200);
    expect(res.body.result.data).toEqual([]);
  });

  it('rejects service-account principals from userOnly admin endpoints with UNAUTHORIZED', async () => {
    const app = makeApp();
    const admin = userCaller();
    const created = await admin.core.serviceAccounts.create({
      name: 'http-roundtrip',
      scopes: ['core.serviceAccounts'],
    });

    // Valid service-account principal → ctx.serviceAccount is set, ctx.user
    // stays null → userOnlyProcedure refuses (the admin surface must never
    // be reachable from a machine principal, even one that has the
    // matching scope granted).
    const res = await request(app)
      .get('/trpc/core.serviceAccounts.list')
      .set('X-API-Key', created.plaintextKey);
    expect(res.status).toBe(401);
    expect(res.body.error.data.code).toBe('UNAUTHORIZED');
  });
});
