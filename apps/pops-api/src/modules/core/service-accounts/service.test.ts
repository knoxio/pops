/**
 * tRPC integration tests for the service-accounts admin router + the
 * `protectedProcedure` scope-enforcement middleware.
 *
 * Service-layer invariants (CRUD, authentication, FIFO, error shapes)
 * live in `packages/core-db/src/__tests__/` — this file only covers what
 * sits above the service: the tRPC procedure wiring, the
 * userOnly/serviceAccount gates, and the scope check in `trpc.ts`.
 */
import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCaller,
  createServiceAccountCaller,
  setupTestContext,
} from '../../../shared/test-utils.js';

const ctx = setupTestContext();

beforeEach(() => {
  ctx.setup();
});

afterEach(() => {
  ctx.teardown();
});

describe('admin tRPC procedures', () => {
  it('rejects service-account callers from the admin endpoints', async () => {
    const sa = createServiceAccountCaller({ scopes: ['core.serviceAccounts'] });
    await expect(
      sa.core.serviceAccounts.create({ name: 'self-mint', scopes: ['core.shell'] })
    ).rejects.toThrow(TRPCError);
    await expect(sa.core.serviceAccounts.list()).rejects.toThrow(TRPCError);
  });

  it('lets a human admin mint, list, then revoke a service account', async () => {
    const admin = createCaller(true);
    const created = await admin.core.serviceAccounts.create({
      name: 'moltbot',
      scopes: ['cerebrum.ingest', 'cerebrum.query'],
    });
    expect(created.plaintextKey).toMatch(/^pops_sa_/);

    const list = await admin.core.serviceAccounts.list();
    expect(list).toHaveLength(1);

    await admin.core.serviceAccounts.revoke({ id: created.id });
    const after = await admin.core.serviceAccounts.list();
    expect(after).toHaveLength(1);
    const [revoked] = after;
    if (!revoked) throw new Error('expected the revoked row to be returned');
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('rejects duplicate names with a BAD_REQUEST tRPC error', async () => {
    const admin = createCaller(true);
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
    const admin = createCaller(true);
    await expect(
      admin.core.serviceAccounts.revoke({ id: 'sa_does-not-exist' })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
      cause: expect.objectContaining({ name: 'NotFoundError' }),
    });
  });

  it('rejects a second revoke with a CONFLICT tRPC error', async () => {
    const admin = createCaller(true);
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
});

describe('protectedProcedure scope enforcement', () => {
  it('lets a service account through when the path is in scope', async () => {
    const sa = createServiceAccountCaller({
      name: 'moltbot',
      scopes: ['core.settings'],
    });
    const result = await sa.core.settings.list({});
    expect(result.data).toEqual([]);
  });

  it('rejects a service account when the path is out of scope', async () => {
    const sa = createServiceAccountCaller({
      name: 'moltbot',
      scopes: ['cerebrum.query'],
    });
    await expect(sa.core.settings.list({})).rejects.toThrow(
      /not authorised for 'core\.settings\.list'/
    );
  });

  it('rejects entirely when neither user nor service account is present', async () => {
    const anon = createCaller(false);
    await expect(anon.core.settings.list({})).rejects.toThrow(/Missing or invalid credentials/);
  });
});
