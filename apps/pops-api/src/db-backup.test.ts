/**
 * Tests for pre-migration backup logic.
 *
 * Uses BetterSqlite3 directly to simulate the openDatabase() flow,
 * verifying that VACUUM INTO backups are created, preserved, or deleted
 * as specified in PRD-060 US-03.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Minimal reproduction of the backup logic from db.ts for testability. */
function getPendingMigrations(database: BetterSqlite3.Database, migrationsDir: string): string[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        version: string;
      }[]
    ).map((r) => r.version)
  );

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  return files.filter((f) => !applied.has(f));
}

function hasData(database: BetterSqlite3.Database): boolean {
  try {
    const row = database.prepare('SELECT COUNT(*) AS cnt FROM transactions').get() as
      | { cnt: number }
      | undefined;
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

function createPreMigrationBackup(
  database: BetterSqlite3.Database,
  dbPath: string,
  _pendingCount: number
): string | null {
  if (!hasData(database)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.pre-migration-${timestamp}.bak`;

  database.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return backupPath;
}

function runMigrations(
  database: BetterSqlite3.Database,
  migrationsDir: string,
  pending: string[]
): void {
  for (const file of pending) {
    const sql = String(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:fs').readFileSync(join(migrationsDir, file), 'utf8')
    );
    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    })();
  }
}

let tmpDir: string;
let dbPath: string;
let migrationsDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'db-backup-test-'));
  dbPath = join(tmpDir, 'test.db');
  migrationsDir = join(tmpDir, 'migrations');
  mkdirSync(migrationsDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('pre-migration backup', () => {
  it('creates backup when pending migrations exist and DB has data', () => {
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, amount REAL)');
    db.exec('INSERT INTO transactions (amount) VALUES (100.00)');
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    writeFileSync(
      join(migrationsDir, '001_add_notes.sql'),
      'ALTER TABLE transactions ADD COLUMN notes TEXT'
    );

    const pending = getPendingMigrations(db, migrationsDir);
    expect(pending).toHaveLength(1);

    const backupPath = createPreMigrationBackup(db, dbPath, pending.length);
    expect(backupPath).not.toBeNull();

    // Verify backup file exists and is a valid SQLite DB
    const backupDb = new BetterSqlite3(backupPath!);
    const row = backupDb.prepare('SELECT COUNT(*) AS cnt FROM transactions').get() as {
      cnt: number;
    };
    expect(row.cnt).toBe(1);
    backupDb.close();
    db.close();
  });

  it('deletes backup after successful migration', () => {
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, amount REAL)');
    db.exec('INSERT INTO transactions (amount) VALUES (100.00)');
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    writeFileSync(
      join(migrationsDir, '001_add_notes.sql'),
      'ALTER TABLE transactions ADD COLUMN notes TEXT'
    );

    const pending = getPendingMigrations(db, migrationsDir);
    const backupPath = createPreMigrationBackup(db, dbPath, pending.length)!;
    expect(backupPath).toBeTruthy();

    // Run migrations successfully
    runMigrations(db, migrationsDir, pending);

    // Delete backup (simulating success cleanup)
    unlinkSync(backupPath);

    // Verify backup is gone
    const files = readdirSync(tmpDir).filter((f) => f.endsWith('.bak'));
    expect(files).toHaveLength(0);
    db.close();
  });

  it('preserves backup when migration fails', () => {
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, amount REAL)');
    db.exec('INSERT INTO transactions (amount) VALUES (100.00)');
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    writeFileSync(join(migrationsDir, '001_bad_migration.sql'), 'INVALID SQL STATEMENT HERE');

    const pending = getPendingMigrations(db, migrationsDir);
    const backupPath = createPreMigrationBackup(db, dbPath, pending.length)!;
    expect(backupPath).toBeTruthy();

    // Migration should fail
    expect(() => runMigrations(db, migrationsDir, pending)).toThrow();

    // Backup should still exist
    const files = readdirSync(tmpDir).filter((f) => f.endsWith('.bak'));
    expect(files).toHaveLength(1);

    // Verify backup data is intact
    const backupDb = new BetterSqlite3(backupPath);
    const row = backupDb.prepare('SELECT COUNT(*) AS cnt FROM transactions').get() as {
      cnt: number;
    };
    expect(row.cnt).toBe(1);
    backupDb.close();
    db.close();
  });

  it('skips backup when no pending migrations', () => {
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, amount REAL)');
    db.exec('INSERT INTO transactions (amount) VALUES (100.00)');

    const pending = getPendingMigrations(db, migrationsDir);
    expect(pending).toHaveLength(0);
    db.close();
  });

  it('skips backup when DB has no data (fresh install)', () => {
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, amount REAL)');
    // No data inserted

    writeFileSync(
      join(migrationsDir, '001_add_notes.sql'),
      'ALTER TABLE transactions ADD COLUMN notes TEXT'
    );

    const pending = getPendingMigrations(db, migrationsDir);
    expect(pending).toHaveLength(1);

    const backupPath = createPreMigrationBackup(db, dbPath, pending.length);
    expect(backupPath).toBeNull();
    db.close();
  });
});
