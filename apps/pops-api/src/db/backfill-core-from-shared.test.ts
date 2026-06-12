/**
 * Boot-time backfill tests for `backfillCoreFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `core.db` against on-disk SQLite files (in-memory DBs can't
 * be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the WHERE filter dedupes),
 *   - mixed state (some rows already in core) only inserts the missing ones,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb } from '@pops/core-db';

import { backfillCoreFromShared, closeCoreDb, setCoreDb } from '../db.js';
import { SERVICE_ACCOUNTS_TABLE_SQL, SETTINGS_TABLE_SQL } from './backfill-test-fixtures.js';

let tmpDir: string;

const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-backfill-'));
});

afterEach(() => {
  closeCoreDb();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

function openSharedWithRows(rows: { id: string; name: string }[]): string {
  const path = join(tmpDir, 'pops.db');
  // Create the shared file via openCoreDb's helper would conflict because
  // openCoreDb applies the core migrations; instead seed a raw SQLite
  // with the canonical service_accounts DDL + the test rows.
  const raw = new BetterSqlite3(path);
  raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
  const insert = raw.prepare(
    `INSERT INTO service_accounts (id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?)`
  );
  for (const row of rows) {
    insert.run(row.id, row.name, `pfx${row.id.slice(0, 5)}`, 'scrypt$x$y');
  }
  raw.close();
  process.env['SQLITE_PATH'] = path;
  return path;
}

describe('backfillCoreFromShared', () => {
  it('returns silently when the core handle is closed', () => {
    setCoreDb(null);
    expect(() => backfillCoreFromShared()).not.toThrow();
  });

  it('copies fresh rows on first run and is a no-op on the second', () => {
    openSharedWithRows([
      { id: 'sa_a', name: 'alpha' },
      { id: 'sa_b', name: 'beta' },
    ]);
    const core = openCoreDb(join(tmpDir, 'core.db'));
    setCoreDb(core);

    backfillCoreFromShared();
    const after = core.raw.prepare('SELECT id, name FROM service_accounts ORDER BY id').all() as {
      id: string;
      name: string;
    }[];
    expect(after.map((r) => r.id)).toEqual(['sa_a', 'sa_b']);

    backfillCoreFromShared();
    const second = core.raw.prepare('SELECT count(*) AS n FROM service_accounts').get() as {
      n: number;
    };
    expect(second.n).toBe(2);
  });

  it('only inserts rows missing from the core copy', () => {
    openSharedWithRows([
      { id: 'sa_a', name: 'alpha' },
      { id: 'sa_b', name: 'beta' },
    ]);
    const core = openCoreDb(join(tmpDir, 'core.db'));
    setCoreDb(core);
    core.raw
      .prepare(`INSERT INTO service_accounts (id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?)`)
      .run('sa_b', 'beta-old', 'pfxBB', 'scrypt$x$y');

    backfillCoreFromShared();
    const rows = core.raw.prepare('SELECT id, name FROM service_accounts ORDER BY id').all() as {
      id: string;
      name: string;
    }[];
    expect(rows).toEqual([
      { id: 'sa_a', name: 'alpha' },
      { id: 'sa_b', name: 'beta-old' },
    ]);
  });

  it('tolerates a shared DB without the service_accounts table', () => {
    const path = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(path);
    raw.close();
    process.env['SQLITE_PATH'] = path;

    const core = openCoreDb(join(tmpDir, 'core.db'));
    setCoreDb(core);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => backfillCoreFromShared()).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    const count = core.raw.prepare('SELECT count(*) AS n FROM service_accounts').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });

  describe('settings (PRD-183 PR 1)', () => {
    function openSharedWithSettings(rows: { key: string; value: string }[]): string {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
      raw.exec(SETTINGS_TABLE_SQL);
      const insert = raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const row of rows) insert.run(row.key, row.value);
      raw.close();
      process.env['SQLITE_PATH'] = path;
      return path;
    }

    it('copies fresh settings rows on first run and is a no-op on the second', () => {
      openSharedWithSettings([
        { key: 'ui.theme', value: 'dark' },
        { key: 'ai.model', value: 'sonnet' },
      ]);
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const after = core.raw.prepare('SELECT key, value FROM settings ORDER BY key').all() as {
        key: string;
        value: string;
      }[];
      expect(after).toEqual([
        { key: 'ai.model', value: 'sonnet' },
        { key: 'ui.theme', value: 'dark' },
      ]);

      backfillCoreFromShared();
      const second = core.raw.prepare('SELECT count(*) AS n FROM settings').get() as {
        n: number;
      };
      expect(second.n).toBe(2);
    });

    it('only inserts settings rows missing from the core copy (preserves existing values)', () => {
      openSharedWithSettings([
        { key: 'ui.theme', value: 'dark' },
        { key: 'ai.model', value: 'sonnet' },
      ]);
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);
      core.raw
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('ui.theme', 'pre-existing-value');

      backfillCoreFromShared();
      const rows = core.raw.prepare('SELECT key, value FROM settings ORDER BY key').all() as {
        key: string;
        value: string;
      }[];
      expect(rows).toEqual([
        { key: 'ai.model', value: 'sonnet' },
        { key: 'ui.theme', value: 'pre-existing-value' },
      ]);
    });

    it('tolerates a shared DB without the settings table', () => {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        expect(() => backfillCoreFromShared()).not.toThrow();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
      const count = core.raw.prepare('SELECT count(*) AS n FROM settings').get() as {
        n: number;
      };
      expect(count.n).toBe(0);
    });

    it('carries every column across (full-shape roundtrip)', () => {
      openSharedWithSettings([
        { key: 'ai.modelOverrides.query', value: 'haiku' },
        { key: 'cerebrum.auditor.contradictionModel', value: 'opus' },
      ]);
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const row = core.raw
        .prepare('SELECT key, value FROM settings WHERE key = ?')
        .get('ai.modelOverrides.query') as { key: string; value: string };
      expect(row).toEqual({ key: 'ai.modelOverrides.query', value: 'haiku' });
    });
  });
});
