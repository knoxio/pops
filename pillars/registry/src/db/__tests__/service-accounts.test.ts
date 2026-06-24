/**
 * Invariant tests for the service-accounts service against an in-memory
 * SQLite seeded with the canonical `service_accounts` migration. Pure DB +
 * service layer — no HTTP, no auth middleware.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ServiceAccountAlreadyRevokedError,
  ServiceAccountNameAlreadyExistsError,
  ServiceAccountNotFoundError,
} from '../errors.js';
import { parseApiKey } from '../services/service-account-keys.js';
import {
  authenticateServiceAccount,
  countActiveServiceAccounts,
  createServiceAccount,
  getActiveServiceAccountByPrefix,
  hasScopeFor,
  listServiceAccounts,
  revokeServiceAccount,
} from '../services/service-accounts.js';

import type { CoreDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../../migrations/0054_service_accounts.sql');

function freshDb(): CoreDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

describe('createServiceAccount', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a row and returns the plaintext key exactly once', async () => {
    const created = await createServiceAccount(
      db,
      { name: 'moltbot', scopes: ['cerebrum.ingest', 'cerebrum.query'] },
      'admin@example.com'
    );
    expect(created.id).toMatch(/^sa_/);
    expect(created.plaintextKey).toMatch(/^pops_sa_/);
    expect(created.scopes).toEqual(['cerebrum.ingest', 'cerebrum.query']);
    expect(created.createdBy).toBe('admin@example.com');

    const rows = listServiceAccounts(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'moltbot' });
    expect(rows[0]).not.toHaveProperty('plaintextKey');
    expect(rows[0]).not.toHaveProperty('keyHash');
  });

  it('rejects duplicate names with a typed error', async () => {
    await createServiceAccount(db, { name: 'dup', scopes: ['core.shell'] }, null);
    await expect(
      createServiceAccount(db, { name: 'dup', scopes: ['core.shell'] }, null)
    ).rejects.toBeInstanceOf(ServiceAccountNameAlreadyExistsError);
  });
});

describe('authenticateServiceAccount', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the principal when prefix + secret match', async () => {
    const created = await createServiceAccount(
      db,
      { name: 'auth-ok', scopes: ['cerebrum.query'] },
      null
    );
    const parsed = parseApiKey(created.plaintextKey);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('unreachable');

    const principal = await authenticateServiceAccount(db, parsed.prefix, parsed.secret);
    expect(principal?.name).toBe('auth-ok');
    expect(principal?.scopes).toEqual(['cerebrum.query']);
  });

  it('returns null for a wrong secret', async () => {
    const created = await createServiceAccount(
      db,
      { name: 'auth-bad-secret', scopes: ['cerebrum.query'] },
      null
    );
    const parsed = parseApiKey(created.plaintextKey);
    if (!parsed) throw new Error('unreachable');
    const principal = await authenticateServiceAccount(db, parsed.prefix, 'tampered-secret');
    expect(principal).toBeNull();
  });

  it('returns null for an unknown prefix', async () => {
    const principal = await authenticateServiceAccount(db, '00000000', 'whatever');
    expect(principal).toBeNull();
  });

  it('returns null after revocation', async () => {
    const created = await createServiceAccount(
      db,
      { name: 'auth-revoked', scopes: ['cerebrum.query'] },
      null
    );
    const parsed = parseApiKey(created.plaintextKey);
    if (!parsed) throw new Error('unreachable');
    revokeServiceAccount(db, created.id);
    const principal = await authenticateServiceAccount(db, parsed.prefix, parsed.secret);
    expect(principal).toBeNull();
  });

  it('updates last_used_at on a successful authentication', async () => {
    const created = await createServiceAccount(
      db,
      { name: 'auth-touch', scopes: ['cerebrum.query'] },
      null
    );
    const parsed = parseApiKey(created.plaintextKey);
    if (!parsed) throw new Error('unreachable');

    const beforeRow = getActiveServiceAccountByPrefix(db, parsed.prefix);
    expect(beforeRow?.lastUsedAt).toBeNull();

    await authenticateServiceAccount(db, parsed.prefix, parsed.secret);

    const afterRow = getActiveServiceAccountByPrefix(db, parsed.prefix);
    expect(afterRow?.lastUsedAt).not.toBeNull();
  });
});

describe('revokeServiceAccount', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('throws a typed error on second revoke', async () => {
    const created = await createServiceAccount(
      db,
      { name: 'double-revoke', scopes: ['cerebrum.query'] },
      null
    );
    revokeServiceAccount(db, created.id);
    expect(() => revokeServiceAccount(db, created.id)).toThrow(ServiceAccountAlreadyRevokedError);
  });

  it('throws a typed error on unknown id', () => {
    expect(() => revokeServiceAccount(db, 'sa_does-not-exist')).toThrow(
      ServiceAccountNotFoundError
    );
  });
});

describe('countActiveServiceAccounts', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('reflects revocations', async () => {
    await createServiceAccount(db, { name: 'active-a', scopes: ['cerebrum.query'] }, null);
    const b = await createServiceAccount(
      db,
      { name: 'active-b', scopes: ['cerebrum.query'] },
      null
    );
    expect(countActiveServiceAccounts(db)).toBe(2);
    revokeServiceAccount(db, b.id);
    expect(countActiveServiceAccounts(db)).toBe(1);
  });
});

describe('getActiveServiceAccountByPrefix', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns null for unknown prefix', () => {
    expect(getActiveServiceAccountByPrefix(db, 'nope----')).toBeNull();
  });

  it('returns null for revoked rows', async () => {
    const created = await createServiceAccount(db, { name: 'a', scopes: ['cerebrum.query'] }, null);
    revokeServiceAccount(db, created.id);
    expect(getActiveServiceAccountByPrefix(db, created.keyPrefix)).toBeNull();
  });

  it('returns the public row for active accounts', async () => {
    const created = await createServiceAccount(db, { name: 'a', scopes: ['cerebrum.query'] }, null);
    const found = getActiveServiceAccountByPrefix(db, created.keyPrefix);
    expect(found?.name).toBe('a');
    expect(found).not.toHaveProperty('plaintextKey');
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
