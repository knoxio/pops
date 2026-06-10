/**
 * Smoke tests for the standalone `openMediaDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 *
 * Mirrors `@pops/core-db`'s open-core-db.test.ts.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb } from '../open-media-db.js';
import { shelfImpressions } from '../schema.js';
import { getRecentImpressions, recordImpressions } from '../services/shelf-impressions.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openMediaDb', () => {
  it('creates the parent directory and opens a fresh DB with the right pragmas', () => {
    const path = join(tmpDir, 'nested', 'sub', 'media.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openMediaDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the shelf_impressions migration', () => {
    const path = join(tmpDir, 'media.db');
    const { db, raw } = openMediaDb(path);
    try {
      // Table exists + accepts the package service end-to-end.
      recordImpressions(db, ['trending']);
      const rows = db.select().from(shelfImpressions).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.shelfId).toBe('trending');
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations or wipe rows', () => {
    const path = join(tmpDir, 'media.db');
    const first = openMediaDb(path);
    try {
      recordImpressions(first.db, ['trending', 'because-you-watched:42']);
      expect(getRecentImpressions(first.db, 7).size).toBe(2);
    } finally {
      first.raw.close();
    }

    const second = openMediaDb(path);
    try {
      // Migration apply is hash-checked + no-op'd; rows persist across opens.
      expect(getRecentImpressions(second.db, 7).size).toBe(2);
      expect(second.raw.pragma('journal_mode', { simple: true })).toBe('wal');
    } finally {
      second.raw.close();
    }
  });
});
