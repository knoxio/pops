/**
 * Smoke tests for the standalone `openInventoryDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb } from '../open-inventory-db.js';
import { createLocation, listLocations } from '../services/locations.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openInventoryDb', () => {
  it('creates the parent directory and opens a fresh DB', () => {
    const path = join(tmpDir, 'nested', 'sub', 'inventory.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openInventoryDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the locations migration', () => {
    const path = join(tmpDir, 'inventory.db');
    const { db, raw } = openInventoryDb(path);
    try {
      expect(listLocations(db).total).toBe(0);
      createLocation(db, { name: 'Home' });
      expect(listLocations(db).total).toBe(1);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', () => {
    const path = join(tmpDir, 'inventory.db');
    const first = openInventoryDb(path);
    try {
      createLocation(first.db, { name: 'persists' });
      expect(listLocations(first.db).total).toBe(1);
    } finally {
      first.raw.close();
    }

    const second = openInventoryDb(path);
    try {
      expect(listLocations(second.db).total).toBe(1);
    } finally {
      second.raw.close();
    }
  });
});
