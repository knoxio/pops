/**
 * Boot-time backfill tests for `backfillFinanceFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `finance.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the per-table WHERE filter dedupes),
 *   - mixed state (some rows already in finance) only inserts the missing ones,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb } from '@pops/finance-db';

import { backfillFinanceFromShared } from './backfill-finance-from-shared.js';
import { WISH_LIST_TABLE_SQL } from './backfill-test-fixtures.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(WISH_LIST_TABLE_SQL);
  seed(raw);
  raw.close();
  return path;
}

describe('backfillFinanceFromShared', () => {
  it('copies wish_list rows from the shared DB on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-1', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-2', 'Headphones', '2026-06-10T00:00:00Z')`
      );
    });

    const finance = openFinanceDb(join(tmpDir, 'finance.db'));
    try {
      backfillFinanceFromShared(finance, sharedPath);
      const rows = finance.raw.prepare('SELECT id, item FROM wish_list ORDER BY id').all() as {
        id: string;
        item: string;
      }[];
      expect(rows).toEqual([
        { id: 'wish-1', item: 'Espresso machine' },
        { id: 'wish-2', item: 'Headphones' },
      ]);
    } finally {
      finance.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-1', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
    });

    const finance = openFinanceDb(join(tmpDir, 'finance.db'));
    try {
      backfillFinanceFromShared(finance, sharedPath);
      backfillFinanceFromShared(finance, sharedPath);
      const count = finance.raw.prepare('SELECT count(*) AS n FROM wish_list').get() as {
        n: number;
      };
      expect(count.n).toBe(1);
    } finally {
      finance.raw.close();
    }
  });

  it('only inserts rows missing from the finance copy (mixed state)', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-shared-only', 'Bike rack', '2026-06-10T00:00:00Z')`
      );
      raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-both', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
    });

    const finance = openFinanceDb(join(tmpDir, 'finance.db'));
    try {
      // Pre-seed the finance.db with one of the rows that also lives in
      // the shared DB; the backfill must skip it but pick up the other.
      finance.raw.exec(
        `INSERT INTO wish_list (id, item, last_edited_time) VALUES ('wish-both', 'Espresso machine', '2026-06-10T00:00:00Z')`
      );
      backfillFinanceFromShared(finance, sharedPath);
      const rows = finance.raw.prepare('SELECT id FROM wish_list ORDER BY id').all() as {
        id: string;
      }[];
      expect(rows.map((r) => r.id)).toEqual(['wish-both', 'wish-shared-only']);
    } finally {
      finance.raw.close();
    }
  });

  it('tolerates a shared DB with no wish_list table (post-PR-4 drop scenario)', () => {
    // Shared DB exists but doesn't have wish_list.
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const finance = openFinanceDb(join(tmpDir, 'finance.db'));
    try {
      expect(() => backfillFinanceFromShared(finance, sharedPath)).not.toThrow();
      const count = finance.raw.prepare('SELECT count(*) AS n FROM wish_list').get() as {
        n: number;
      };
      expect(count.n).toBe(0);
    } finally {
      finance.raw.close();
    }
  });
});
