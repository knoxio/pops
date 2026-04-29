/**
 * Migration safety tests — verifies that the schema + seed path
 * preserves data integrity, and that migrations are correctly tracked.
 *
 * PRD-060 US-04: CI tests that verify migrations don't lose data.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeSchema } from './schema.js';
import { seedDatabase } from './seeder.js';

/** Reproduce runMigrations locally for testability (not exported from db.ts). */
function runMigrations(database: BetterSqlite3.Database, migrationsDir: string): string[] {
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
      .toSorted();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const pending = files.filter((f) => !applied.has(f));

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

  return pending;
}

/** Helper to get a row count for a table. */
function count(db: BetterSqlite3.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number }).cnt;
}

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'migration-safety-test-'));
  dbPath = join(tmpDir, 'test.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('migration safety', () => {
  describe('fresh schema + seed data integrity', () => {
    it('seeds all expected tables with correct row counts', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      seedDatabase(db);

      // Row counts from CLAUDE.md: 10 entities, 16 transactions, 8 budgets,
      // 5 inventory, 5 wishlist, 10 movies, 3 tv shows, 5 seasons, 16 episodes
      expect(count(db, 'entities')).toBe(10);
      expect(count(db, 'transactions')).toBe(16);
      expect(count(db, 'budgets')).toBe(8);
      expect(count(db, 'home_inventory')).toBe(20);
      expect(count(db, 'wish_list')).toBe(5);
      expect(count(db, 'movies')).toBe(10);
      expect(count(db, 'tv_shows')).toBe(3);
      expect(count(db, 'seasons')).toBeGreaterThanOrEqual(5);
      expect(count(db, 'episodes')).toBeGreaterThanOrEqual(16);

      db.close();
    });

    it('preserves FK relationships after seeding', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      seedDatabase(db);

      // FK integrity check — SQLite returns rows for violations
      const fkErrors = db.pragma('foreign_key_check') as unknown[];
      expect(fkErrors).toHaveLength(0);

      db.close();
    });

    it('preserves JSON columns after seeding', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      seedDatabase(db);

      // Transactions have tags as JSON
      const txRows = db.prepare("SELECT tags FROM transactions WHERE tags != '[]'").all() as {
        tags: string;
      }[];
      expect(txRows.length).toBeGreaterThan(0);
      for (const row of txRows) {
        expect(() => JSON.parse(row.tags) as unknown).not.toThrow();
      }

      // Movies have genres as JSON
      const movieRows = db.prepare('SELECT genres FROM movies WHERE genres IS NOT NULL').all() as {
        genres: string;
      }[];
      expect(movieRows.length).toBeGreaterThan(0);
      for (const row of movieRows) {
        expect(() => JSON.parse(row.genres) as unknown).not.toThrow();
      }

      db.close();
    });

    it('preserves entity FK on transactions', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      seedDatabase(db);

      // Every transaction with an entity_id should reference a valid entity
      const orphans = db
        .prepare(
          `SELECT t.id FROM transactions t
           WHERE t.entity_id IS NOT NULL
           AND t.entity_id NOT IN (SELECT id FROM entities)`
        )
        .all();
      expect(orphans).toHaveLength(0);

      db.close();
    });
  });

  describe('schema_migrations tracking', () => {
    it('pre-marks all INCLUDED_MIGRATIONS as applied', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      initializeSchema(db);

      const appliedRows = db
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as { version: string }[];
      const applied = appliedRows.map((r) => r.version);

      // Should include all known migrations
      expect(applied).toContain('007_transaction_corrections.sql');
      expect(applied).toContain('20260328130000_watchlist_source_plex_key.sql');
      expect(applied.length).toBeGreaterThanOrEqual(16);

      db.close();
    });

    it('runMigrations is a no-op on freshly initialized DB', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      initializeSchema(db);

      // Point at the real migrations directory
      const migrationsDir = join(__dirname, 'migrations');
      const pendingApplied = runMigrations(db, migrationsDir);

      expect(pendingApplied).toHaveLength(0);

      db.close();
    });
  });

  describe('schema idempotency', () => {
    it('running initializeSchema twice does not error', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');

      initializeSchema(db);
      expect(() => {
        initializeSchema(db);
      }).not.toThrow();

      db.close();
    });

    it('running initializeSchema twice does not duplicate migration records', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');

      initializeSchema(db);
      const countBefore = count(db, 'schema_migrations');

      initializeSchema(db);
      const countAfter = count(db, 'schema_migrations');

      expect(countAfter).toBe(countBefore);

      db.close();
    });
  });

  describe('migration applies correctly', () => {
    it('new column migration preserves existing data with default value', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      seedDatabase(db);

      const countBefore = count(db, 'transactions');

      // Create a test migration that adds a new column
      const testMigrationsDir = join(tmpDir, 'test-migrations');
      mkdirSync(testMigrationsDir);
      writeFileSync(
        join(testMigrationsDir, '999_add_test_column.sql'),
        'ALTER TABLE transactions ADD COLUMN test_flag INTEGER DEFAULT 0'
      );

      const applied = runMigrations(db, testMigrationsDir);
      expect(applied).toHaveLength(1);

      // Row count must be unchanged
      expect(count(db, 'transactions')).toBe(countBefore);

      // Existing rows get the default value
      const rows = db.prepare('SELECT test_flag FROM transactions').all() as {
        test_flag: number | null;
      }[];
      for (const row of rows) {
        expect(row.test_flag).toBe(0); // SQLite: ALTER ADD COLUMN with DEFAULT applies the default
      }

      db.close();
    });

    it('column rename migration preserves data', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      seedDatabase(db);

      // Get original notes values from wish_list
      const originalNotes = db
        .prepare('SELECT id, notes FROM wish_list WHERE notes IS NOT NULL')
        .all() as { id: string; notes: string }[];
      expect(originalNotes.length).toBeGreaterThan(0);

      // Rename column via migration
      const testMigrationsDir = join(tmpDir, 'rename-migrations');
      mkdirSync(testMigrationsDir);
      writeFileSync(
        join(testMigrationsDir, '999_rename_notes.sql'),
        'ALTER TABLE wish_list RENAME COLUMN notes TO description'
      );

      const applied = runMigrations(db, testMigrationsDir);
      expect(applied).toHaveLength(1);

      // Data preserved under new name
      const renamedData = db
        .prepare('SELECT id, description FROM wish_list WHERE description IS NOT NULL')
        .all() as { id: string; description: string }[];

      expect(renamedData.length).toBe(originalNotes.length);
      for (const orig of originalNotes) {
        const renamed = renamedData.find((r) => r.id === orig.id);
        expect(renamed).toBeDefined();
        expect(renamed!.description).toBe(orig.notes);
      }

      db.close();
    });

    it('failed migration does not partially apply', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      initializeSchema(db);
      seedDatabase(db);

      const testMigrationsDir = join(tmpDir, 'bad-migrations');
      mkdirSync(testMigrationsDir);
      writeFileSync(join(testMigrationsDir, '999_bad_migration.sql'), 'INVALID SQL SYNTAX HERE');

      expect(() => runMigrations(db, testMigrationsDir)).toThrow();

      // Bad migration should not be recorded
      const appliedRows = db
        .prepare("SELECT version FROM schema_migrations WHERE version = '999_bad_migration.sql'")
        .all();
      expect(appliedRows).toHaveLength(0);

      db.close();
    });
  });

  describe('0042_strip_quoted_movie_titles migration', () => {
    const migrationSql = `
      UPDATE movies
      SET title = TRIM(title, '"')
      WHERE title LIKE '"%"'
        AND length(title) > 2
        AND TRIM(title, '"') != '';
    `;

    function insertMovie(db: BetterSqlite3.Database, title: string): void {
      db.prepare(
        `INSERT INTO movies (tmdb_id, title, genres, created_at, updated_at)
         VALUES (abs(random()) % 1000000, ?, '[]', datetime('now'), datetime('now'))`
      ).run(title);
    }

    it('strips surrounding quotes from a wrapped title', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, '"Wuthering Heights"');
      db.exec(migrationSql);
      const row = db.prepare("SELECT title FROM movies WHERE title = 'Wuthering Heights'").get();
      expect(row).toBeDefined();
      db.close();
    });

    it('does not touch a title with only a leading quote', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, '"Something');
      db.exec(migrationSql);
      const row = db.prepare("SELECT title FROM movies WHERE title = '\"Something'").get();
      expect(row).toBeDefined();
      db.close();
    });

    it('does not touch a title with only a trailing quote', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, 'Something"');
      db.exec(migrationSql);
      const row = db.prepare("SELECT title FROM movies WHERE title = 'Something\"'").get();
      expect(row).toBeDefined();
      db.close();
    });

    it('does not touch a title with internal quotes', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, 'Film "Noir" Style');
      db.exec(migrationSql);
      const row = db
        .prepare("SELECT title FROM movies WHERE title = 'Film \"Noir\" Style'")
        .get();
      expect(row).toBeDefined();
      db.close();
    });

    it('does not produce an empty title from bare ""', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, '""');
      db.exec(migrationSql);
      const row = db.prepare(`SELECT title FROM movies WHERE title = '""'`).get();
      expect(row).toBeDefined();
      db.close();
    });

    it('does not produce an empty title from all-quote string """', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, '"""');
      db.exec(migrationSql);
      const row = db.prepare(`SELECT title FROM movies WHERE title = '"""'`).get();
      expect(row).toBeDefined();
      db.close();
    });

    it('does not affect a clean title', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, 'The Dark Knight');
      db.exec(migrationSql);
      const row = db.prepare("SELECT title FROM movies WHERE title = 'The Dark Knight'").get();
      expect(row).toBeDefined();
      db.close();
    });

    it('is idempotent — running twice gives the same result', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      initializeSchema(db);
      insertMovie(db, '"Wuthering Heights"');
      db.exec(migrationSql);
      db.exec(migrationSql);
      const rows = db
        .prepare("SELECT title FROM movies WHERE title LIKE '%Wuthering%'")
        .all() as { title: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.title).toBe('Wuthering Heights');
      db.close();
    });
  });
});
