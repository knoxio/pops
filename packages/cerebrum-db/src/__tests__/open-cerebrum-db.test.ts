/**
 * Smoke tests for the standalone `openCerebrumDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb } from '../open-cerebrum-db.js';
import { nudgeLog } from '../schema.js';
import { persistCandidates } from '../services/nudge-log.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openCerebrumDb', () => {
  it('creates the parent directory and opens a fresh DB', () => {
    const path = join(tmpDir, 'nested', 'sub', 'cerebrum.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openCerebrumDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the nudge_log migration and accepts writes via the service', () => {
    const path = join(tmpDir, 'cerebrum.db');
    const { db, raw } = openCerebrumDb(path);
    try {
      expect(db.select().from(nudgeLog).all()).toHaveLength(0);
      const created = persistCandidates(
        db,
        [
          {
            type: 'pattern',
            title: 'T',
            body: 'B',
            engramIds: ['e1'],
            priority: 'medium',
            expiresAt: null,
            action: null,
          },
        ],
        { nudgeCooldownHours: 24 }
      );
      expect(created).toBe(1);
      expect(db.select().from(nudgeLog).all()).toHaveLength(1);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', () => {
    const path = join(tmpDir, 'cerebrum.db');
    const first = openCerebrumDb(path);
    try {
      persistCandidates(
        first.db,
        [
          {
            type: 'pattern',
            title: 'T',
            body: 'B',
            engramIds: ['e1'],
            priority: 'medium',
            expiresAt: null,
            action: null,
          },
        ],
        { nudgeCooldownHours: 24 }
      );
      expect(first.db.select().from(nudgeLog).all()).toHaveLength(1);
    } finally {
      first.raw.close();
    }

    const second = openCerebrumDb(path);
    try {
      expect(second.db.select().from(nudgeLog).all()).toHaveLength(1);
    } finally {
      second.raw.close();
    }
  });
});
