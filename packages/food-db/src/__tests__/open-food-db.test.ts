/**
 * Smoke tests for the standalone `openFoodDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 *
 * Uses real tmpdir-backed files (not `:memory:`) because the Phase 2
 * follow-ups (PR 2's pops-api boot wire-up, PR 3's consumer cutover,
 * and the eventual ATTACH-based backfill window) will exercise this
 * helper against on-disk DBs and shared paths. Keep parity here so
 * surprises surface in tests, not in production.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../open-food-db.js';
import { prepStates } from '../schema.js';
import { listPrepStates } from '../services/prep-states.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openFoodDb', () => {
  it('creates the parent directory and opens a fresh DB', () => {
    const path = join(tmpDir, 'nested', 'sub', 'food.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openFoodDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the food slice migration', () => {
    const path = join(tmpDir, 'food.db');
    const { db, raw } = openFoodDb(path);
    try {
      expect(listPrepStates(db)).toEqual([]);
      const inserted = db
        .insert(prepStates)
        .values({ name: 'Diced', slug: 'diced' })
        .returning()
        .get();
      expect(inserted?.slug).toBe('diced');
      expect(listPrepStates(db)).toHaveLength(1);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', () => {
    const path = join(tmpDir, 'food.db');
    const first = openFoodDb(path);
    try {
      first.db.insert(prepStates).values({ name: 'Whole', slug: 'whole' }).run();
      expect(listPrepStates(first.db)).toHaveLength(1);
    } finally {
      first.raw.close();
    }

    const second = openFoodDb(path);
    try {
      const rows = listPrepStates(second.db);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.slug).toBe('whole');
    } finally {
      second.raw.close();
    }
  });

  it('throws when the path points at a directory that cannot be opened as a DB file', () => {
    expect(() => openFoodDb(tmpDir)).toThrow();
  });
});
