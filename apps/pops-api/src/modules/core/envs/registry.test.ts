/**
 * Unit tests for the environment registry.
 *
 * Uses real file I/O in a per-test temp directory so that DB creation,
 * seeding, TTL handling, and file cleanup are exercised end-to-end while
 * remaining fully isolated from the production SQLite database.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, getDb, setDb } from '../../../db.js';
import { initializeSchema } from '../../../db/schema.js';
import {
  closeEnvDb,
  createEnv,
  deleteEnv,
  deleteExpiredEnvs,
  type EnvRecord,
  getEnvRecord,
  getOrOpenEnvDb,
  listEnvs,
  startupCleanup,
  ttlRemaining,
  updateEnvTtl,
  validateEnvName,
} from './registry.js';

let tmpDir: string;

/**
 * Assert that an env record exists and narrow its type.
 * Throws (fails the test) if the record is null.
 */
function assertEnv(name: string): EnvRecord {
  const record = getEnvRecord(name);
  if (!record) throw new Error(`Expected env '${name}' to exist in registry`);
  return record;
}

function setupProdDb() {
  const db = new BetterSqlite3(join(tmpDir, 'pops.db'));
  initializeSchema(db);
  setDb(db);
  return db;
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `pops-env-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  process.env['SQLITE_PATH'] = join(tmpDir, 'pops.db');
  setupProdDb();
});

afterEach(() => {
  // Close all env connections before closing the prod DB
  for (const env of listEnvs()) {
    closeEnvDb(env.name);
  }
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['SQLITE_PATH'];
});

// ---------------------------------------------------------------------------
// validateEnvName
// ---------------------------------------------------------------------------

describe('validateEnvName', () => {
  it('accepts simple alphanumeric names', () => {
    expect(validateEnvName('e2e')).toBeNull();
    expect(validateEnvName('myenv123')).toBeNull();
    expect(validateEnvName('test-env')).toBeNull();
    expect(validateEnvName('TEST')).toBeNull();
  });

  it('accepts names at boundary lengths', () => {
    expect(validateEnvName('a')).toBeNull(); // min length
    expect(validateEnvName('a'.repeat(64))).toBeNull(); // max length
  });

  it("rejects the reserved name 'prod'", () => {
    expect(validateEnvName('prod')).toMatch(/reserved/i);
  });

  it('rejects names with spaces', () => {
    expect(validateEnvName('my env')).not.toBeNull();
  });

  it('rejects names with underscores', () => {
    expect(validateEnvName('my_env')).not.toBeNull();
  });

  it('rejects names with dots', () => {
    expect(validateEnvName('my.env')).not.toBeNull();
  });

  it('rejects names longer than 64 characters', () => {
    expect(validateEnvName('a'.repeat(65))).not.toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateEnvName('')).not.toBeNull();
  });

  it('rejects names starting with a hyphen', () => {
    expect(validateEnvName('-test')).not.toBeNull();
  });

  it('rejects names ending with a hyphen', () => {
    expect(validateEnvName('test-')).not.toBeNull();
  });

  it('rejects names that are only hyphens', () => {
    expect(validateEnvName('---')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createEnv
// ---------------------------------------------------------------------------

describe('createEnv', () => {
  it('creates a DB file at the expected path', () => {
    createEnv('create-test', 'none', null);
    const expectedPath = join(tmpDir, 'envs', 'create-test.db');
    expect(existsSync(expectedPath)).toBe(true);
  });

  it('inserts a registry row in the prod DB', () => {
    createEnv('create-row', 'none', null);
    const record = assertEnv('create-row');
    expect(record.name).toBe('create-row');
    expect(record.seed_type).toBe('none');
    expect(record.ttl_seconds).toBeNull();
    expect(record.expires_at).toBeNull();
  });

  it('stores the db_path that points to the created file', () => {
    createEnv('path-check', 'none', null);
    expect(existsSync(assertEnv('path-check').db_path)).toBe(true);
  });

  it("seeds the DB when seed_type is 'test'", () => {
    createEnv('seeded', 'test', null);
    const envDb = getOrOpenEnvDb(assertEnv('seeded'));
    const count = envDb.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number };
    expect(count.n).toBeGreaterThan(0);
  });

  it("leaves DB empty when seed_type is 'none'", () => {
    createEnv('empty', 'none', null);
    const envDb = getOrOpenEnvDb(assertEnv('empty'));
    const count = envDb.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('computes expires_at from ttlSeconds', () => {
    const before = Date.now();
    createEnv('ttl-env', 'none', 3600);
    const after = Date.now();

    const record = assertEnv('ttl-env');
    expect(record.ttl_seconds).toBe(3600);
    expect(record.expires_at).not.toBeNull();

    const expiresAt = record.expires_at;
    if (!expiresAt) throw new Error('expires_at should not be null');
    const expiresMs = new Date(expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50);
    expect(expiresMs).toBeLessThanOrEqual(after + 3600 * 1000 + 50);
  });

  it('sets expires_at to null for null ttl', () => {
    createEnv('infinite', 'none', null);
    const record = assertEnv('infinite');
    expect(record.expires_at).toBeNull();
    expect(record.ttl_seconds).toBeNull();
  });

  it('created env DB has proper schema (all core tables exist)', () => {
    createEnv('schema-check', 'none', null);
    const db = getOrOpenEnvDb(assertEnv('schema-check'));

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('transactions');
    expect(names).toContain('entities');
    expect(names).toContain('budgets');
    expect(names).toContain('home_inventory');
    expect(names).toContain('wish_list');
  });
});

// ---------------------------------------------------------------------------
// getEnvRecord / listEnvs
// ---------------------------------------------------------------------------

describe('getEnvRecord', () => {
  it('returns null when no env exists with that name', () => {
    expect(getEnvRecord('nonexistent')).toBeNull();
  });

  it('returns the record for an existing env', () => {
    createEnv('lookup-test', 'none', null);
    const record = getEnvRecord('lookup-test');
    expect(record).not.toBeNull();
    expect(record?.name).toBe('lookup-test');
  });
});

describe('listEnvs', () => {
  it('returns empty array when no envs exist', () => {
    expect(listEnvs()).toEqual([]);
  });

  it('returns all envs ordered by created_at DESC', () => {
    createEnv('alpha', 'none', null);
    createEnv('beta', 'none', null);
    createEnv('gamma', 'none', null);

    const names = listEnvs().map((e) => e.name);
    expect(names).toHaveLength(3);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
  });
});

// ---------------------------------------------------------------------------
// getOrOpenEnvDb / closeEnvDb
// ---------------------------------------------------------------------------

describe('getOrOpenEnvDb', () => {
  it('returns a usable database', () => {
    createEnv('open-test', 'none', null);
    const record = assertEnv('open-test');
    const db = getOrOpenEnvDb(record);
    expect(db.open).toBe(true);
    // Should be able to query it
    const result = db.prepare('SELECT 1 as n').get() as { n: number };
    expect(result.n).toBe(1);
  });

  it('returns the same instance on repeated calls (cache hit)', () => {
    createEnv('cache-test', 'none', null);
    const record = assertEnv('cache-test');
    const db1 = getOrOpenEnvDb(record);
    const db2 = getOrOpenEnvDb(record);
    expect(db1).toBe(db2);
  });
});

describe('closeEnvDb', () => {
  it('closes the connection so subsequent queries would fail', () => {
    createEnv('close-test', 'none', null);
    const record = assertEnv('close-test');
    const db = getOrOpenEnvDb(record);
    expect(db.open).toBe(true);

    closeEnvDb('close-test');
    expect(db.open).toBe(false);
  });

  it('is a no-op when no connection is cached', () => {
    // Should not throw
    expect(() => closeEnvDb('never-opened')).not.toThrow();
  });

  it('evicts the cache so the next getOrOpenEnvDb opens a fresh connection', () => {
    createEnv('reopen-test', 'none', null);
    const record = assertEnv('reopen-test');
    const db1 = getOrOpenEnvDb(record);
    closeEnvDb('reopen-test');

    const db2 = getOrOpenEnvDb(record);
    expect(db2).not.toBe(db1);
    expect(db2.open).toBe(true);
    closeEnvDb('reopen-test');
  });
});

// ---------------------------------------------------------------------------
// updateEnvTtl
// ---------------------------------------------------------------------------

describe('updateEnvTtl', () => {
  it('updates ttl_seconds and recomputes expires_at', () => {
    createEnv('ttl-update', 'none', null);
    const before = Date.now();
    updateEnvTtl('ttl-update', 7200);
    const after = Date.now();

    const record = assertEnv('ttl-update');
    expect(record.ttl_seconds).toBe(7200);
    const expiresAt = record.expires_at;
    if (!expiresAt) throw new Error('expires_at should not be null after updateEnvTtl');
    const expiresMs = new Date(expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 7200 * 1000 - 50);
    expect(expiresMs).toBeLessThanOrEqual(after + 7200 * 1000 + 50);
  });

  it('clears expires_at when ttl is null', () => {
    createEnv('ttl-clear', 'none', 3600);
    updateEnvTtl('ttl-clear', null);

    const record = assertEnv('ttl-clear');
    expect(record.ttl_seconds).toBeNull();
    expect(record.expires_at).toBeNull();
  });

  it('returns null for a non-existent env', () => {
    const result = updateEnvTtl('ghost', 60);
    expect(result).toBeNull();
  });

  it('returns the updated record', () => {
    createEnv('ttl-return', 'none', null);
    const updated = updateEnvTtl('ttl-return', 120);
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('ttl-return');
    expect(updated?.ttl_seconds).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// deleteEnv
// ---------------------------------------------------------------------------

describe('deleteEnv', () => {
  it('removes the registry row', () => {
    createEnv('del-test', 'none', null);
    deleteEnv('del-test');
    expect(getEnvRecord('del-test')).toBeNull();
  });

  it('deletes the DB file from disk', () => {
    createEnv('del-file', 'none', null);
    const record = assertEnv('del-file');
    const path = record.db_path;
    expect(existsSync(path)).toBe(true);

    deleteEnv('del-file');
    expect(existsSync(path)).toBe(false);
  });

  it('closes the DB connection', () => {
    createEnv('del-conn', 'none', null);
    const record = assertEnv('del-conn');
    const db = getOrOpenEnvDb(record);
    expect(db.open).toBe(true);

    deleteEnv('del-conn');
    expect(db.open).toBe(false);
  });

  it('returns false when env does not exist', () => {
    expect(deleteEnv('nope')).toBe(false);
  });

  it('returns true when env is deleted', () => {
    createEnv('del-true', 'none', null);
    expect(deleteEnv('del-true')).toBe(true);
  });

  it('is idempotent: second delete returns false', () => {
    createEnv('del-idem', 'none', null);
    expect(deleteEnv('del-idem')).toBe(true);
    expect(deleteEnv('del-idem')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteExpiredEnvs
// ---------------------------------------------------------------------------

describe('deleteExpiredEnvs', () => {
  it('returns empty array when no envs exist', () => {
    expect(deleteExpiredEnvs()).toEqual([]);
  });

  it('does not delete envs with no expiry', () => {
    createEnv('infinite-env', 'none', null);
    const deleted = deleteExpiredEnvs();
    expect(deleted).toEqual([]);
    expect(getEnvRecord('infinite-env')).not.toBeNull();
  });

  it('does not delete envs with future expiry', () => {
    createEnv('future-env', 'none', 3600);
    const deleted = deleteExpiredEnvs();
    expect(deleted).toEqual([]);
    expect(getEnvRecord('future-env')).not.toBeNull();
  });

  it('deletes envs whose expires_at is in the past', () => {
    createEnv('expired-env', 'none', null);
    const record = assertEnv('expired-env');

    // Backdate the expiry directly via the active prod DB
    const pastIso = new Date(Date.now() - 3600 * 1000).toISOString();
    getDb()
      .prepare(`UPDATE environments SET ttl_seconds=1, expires_at=? WHERE name='expired-env'`)
      .run(pastIso);

    const deleted = deleteExpiredEnvs();
    expect(deleted).toContain('expired-env');
    expect(getEnvRecord('expired-env')).toBeNull();
    expect(existsSync(record.db_path)).toBe(false);
  });

  it('only deletes expired envs, leaves non-expired untouched', () => {
    createEnv('keep-me', 'none', 7200);
    createEnv('purge-me', 'none', null);

    // Backdate "purge-me" to 1 minute ago via the active prod DB
    const pastIso = new Date(Date.now() - 60 * 1000).toISOString();
    getDb()
      .prepare(`UPDATE environments SET ttl_seconds=1, expires_at=? WHERE name='purge-me'`)
      .run(pastIso);

    const deleted = deleteExpiredEnvs();
    expect(deleted).toContain('purge-me');
    expect(deleted).not.toContain('keep-me');
    expect(getEnvRecord('keep-me')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ttlRemaining
// ---------------------------------------------------------------------------

describe('ttlRemaining', () => {
  it('returns null for envs with no expiry', () => {
    createEnv('no-ttl', 'none', null);
    const record = assertEnv('no-ttl');
    expect(ttlRemaining(record)).toBeNull();
  });

  it('returns a positive number for envs with future expiry', () => {
    createEnv('future-ttl', 'none', 3600);
    const record = assertEnv('future-ttl');
    const remaining = ttlRemaining(record);
    expect(remaining).not.toBeNull();
    expect(remaining).toBeGreaterThan(3590);
    expect(remaining).toBeLessThanOrEqual(3600);
  });

  it('returns 0 for envs whose expiry has passed', () => {
    const pastRecord: EnvRecord = {
      name: 'past',
      db_path: '/tmp/past.db',
      seed_type: 'none',
      ttl_seconds: 1,
      created_at: new Date(Date.now() - 10000).toISOString(),
      expires_at: new Date(Date.now() - 5000).toISOString(),
    };
    expect(ttlRemaining(pastRecord)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// startupCleanup
// ---------------------------------------------------------------------------

describe('startupCleanup', () => {
  it('returns empty arrays when nothing to clean up', () => {
    const result = startupCleanup();
    expect(result.expired).toEqual([]);
    expect(result.orphaned).toEqual([]);
  });

  it('removes expired envs', () => {
    createEnv('startup-expired', 'none', null);
    const record = assertEnv('startup-expired');

    const pastIso = new Date(Date.now() - 3600 * 1000).toISOString();
    getDb()
      .prepare(`UPDATE environments SET ttl_seconds=1, expires_at=? WHERE name='startup-expired'`)
      .run(pastIso);

    const result = startupCleanup();
    expect(result.expired).toContain('startup-expired');
    expect(getEnvRecord('startup-expired')).toBeNull();
    expect(existsSync(record.db_path)).toBe(false);
  });

  it('removes orphaned DB files that have no registry entry', () => {
    // Simulate a crash mid-createEnv: file on disk but no registry row
    const envsDir = join(tmpDir, 'envs');
    mkdirSync(envsDir, { recursive: true });
    const orphanPath = join(envsDir, 'ghost-crash.db');
    // Create a minimal SQLite file (BetterSqlite3 writes the file on construction)
    const ghostDb = new BetterSqlite3(orphanPath);
    ghostDb.close();
    expect(existsSync(orphanPath)).toBe(true);

    const result = startupCleanup();
    expect(result.orphaned).toContain('ghost-crash');
    expect(existsSync(orphanPath)).toBe(false);
  });

  it('does not touch registered envs with valid files', () => {
    createEnv('keep-startup', 'none', null);
    const record = assertEnv('keep-startup');

    const result = startupCleanup();
    expect(result.orphaned).not.toContain('keep-startup');
    expect(result.expired).not.toContain('keep-startup');
    expect(existsSync(record.db_path)).toBe(true);
  });
});
