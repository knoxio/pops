/**
 * Service-account CRUD + verification + scope enforcement tests.
 *
 * These exercise the full happy/sad paths an admin and a service-account
 * caller hit at runtime. Hash verification is exercised once via the key
 * unit tests; this file focuses on DB rows + tRPC behaviour.
 */
import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCaller,
  createServiceAccountCaller,
  setupTestContext,
} from '../../../shared/test-utils.js';
import { parseApiKey } from './key.js';
import {
  authenticateServiceAccount,
  countActiveServiceAccounts,
  createServiceAccount,
  hasScopeFor,
  listServiceAccounts,
  revokeServiceAccount,
} from './service.js';

const ctx = setupTestContext();

beforeEach(() => {
  ctx.setup();
});

afterEach(() => {
  ctx.teardown();
});

describe('createServiceAccount', () => {
  it('creates a row and returns the plaintext key exactly once', async () => {
    const created = await createServiceAccount(
      { name: 'moltbot', scopes: ['cerebrum.ingest', 'cerebrum.query'] },
      'admin@example.com'
    );
    expect(created.id).toMatch(/^sa_/);
    expect(created.plaintextKey).toMatch(/^pops_sa_/);
    expect(created.scopes).toEqual(['cerebrum.ingest', 'cerebrum.query']);
    expect(created.createdBy).toBe('admin@example.com');

    // Listing must not leak the plaintext or hash.
    const rows = listServiceAccounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'moltbot' });
    expect(rows[0]).not.toHaveProperty('plaintextKey');
    expect(rows[0]).not.toHaveProperty('keyHash');
  });

  it('rejects duplicate names', async () => {
    await createServiceAccount({ name: 'dup', scopes: ['core.shell'] }, null);
    await expect(
      createServiceAccount({ name: 'dup', scopes: ['core.shell'] }, null)
    ).rejects.toMatchObject({
      details: { message: "Service account 'dup' already exists" },
    });
  });
});

describe('authenticateServiceAccount', () => {
  it('returns the principal when prefix + secret match', async () => {
    const created = await createServiceAccount(
      { name: 'auth-ok', scopes: ['cerebrum.query'] },
      null
    );
    const parsed = parseApiKey(created.plaintextKey);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('unreachable');

    const principal = await authenticateServiceAccount(parsed.prefix, parsed.secret);
    expect(principal?.name).toBe('auth-ok');
    expect(principal?.scopes).toEqual(['cerebrum.query']);
  });

  it('returns null for a wrong secret', async () => {
    const created = await createServiceAccount(
      { name: 'auth-bad-secret', scopes: ['cerebrum.query'] },
      null
    );
    const parsed = parseApiKey(created.plaintextKey);
    if (!parsed) throw new Error('unreachable');
    const principal = await authenticateServiceAccount(parsed.prefix, 'tampered-secret');
    expect(principal).toBeNull();
  });

  it('returns null for an unknown prefix', async () => {
    const principal = await authenticateServiceAccount('00000000', 'whatever');
    expect(principal).toBeNull();
  });

  it('returns null after revocation', async () => {
    const created = await createServiceAccount(
      { name: 'auth-revoked', scopes: ['cerebrum.query'] },
      null
    );
    const parsed = parseApiKey(created.plaintextKey);
    if (!parsed) throw new Error('unreachable');
    revokeServiceAccount(created.id);
    const principal = await authenticateServiceAccount(parsed.prefix, parsed.secret);
    expect(principal).toBeNull();
  });
});

describe('revokeServiceAccount', () => {
  it('throws on second revoke', async () => {
    const created = await createServiceAccount(
      { name: 'double-revoke', scopes: ['cerebrum.query'] },
      null
    );
    revokeServiceAccount(created.id);
    expect(() => revokeServiceAccount(created.id)).toThrow(/already revoked/);
  });

  it('throws on unknown id', () => {
    expect(() => revokeServiceAccount('sa_does-not-exist')).toThrow(/not found/);
  });
});

describe('countActiveServiceAccounts', () => {
  it('reflects revocations', async () => {
    await createServiceAccount({ name: 'active-a', scopes: ['cerebrum.query'] }, null);
    const b = await createServiceAccount({ name: 'active-b', scopes: ['cerebrum.query'] }, null);
    expect(countActiveServiceAccounts()).toBe(2);
    revokeServiceAccount(b.id);
    expect(countActiveServiceAccounts()).toBe(1);
  });
});

describe('hasScopeFor', () => {
  it('matches exact and prefix paths', () => {
    expect(hasScopeFor(['cerebrum.ingest'], 'cerebrum.ingest.quickCapture')).toBe(true);
    expect(hasScopeFor(['cerebrum.ingest'], 'cerebrum.ingest')).toBe(true);
    expect(hasScopeFor(['cerebrum.ingest'], 'cerebrum.query.ask')).toBe(false);
  });

  it('does not match a sibling that shares a prefix substring', () => {
    expect(hasScopeFor(['cerebrum.ing'], 'cerebrum.ingest.quickCapture')).toBe(false);
  });

  it('returns false for empty granted scopes', () => {
    expect(hasScopeFor([], 'cerebrum.query.ask')).toBe(false);
  });
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
