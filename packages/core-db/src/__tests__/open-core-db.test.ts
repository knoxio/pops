/**
 * Smoke tests for the standalone `openCoreDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb } from '../open-core-db.js';
import { countActiveServiceAccounts, createServiceAccount } from '../services/service-accounts.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openCoreDb', () => {
  it('creates the parent directory and opens a fresh DB', () => {
    const path = join(tmpDir, 'nested', 'sub', 'core.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openCoreDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the service_accounts migration', () => {
    const path = join(tmpDir, 'core.db');
    const { db, raw } = openCoreDb(path);
    try {
      // Table exists + accepts inserts via the package service.
      expect(countActiveServiceAccounts(db)).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', async () => {
    const path = join(tmpDir, 'core.db');
    const first = openCoreDb(path);
    try {
      await createServiceAccount(first.db, { name: 'persists', scopes: ['x'] }, null);
      expect(countActiveServiceAccounts(first.db)).toBe(1);
    } finally {
      first.raw.close();
    }

    const second = openCoreDb(path);
    try {
      expect(countActiveServiceAccounts(second.db)).toBe(1);
    } finally {
      second.raw.close();
    }
  });
});
