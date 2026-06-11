/**
 * Migration safety tests — verifies that the schema + seed path
 * preserves data integrity, and that migrations are correctly tracked.
 *
 * PRD-060 US-04: CI tests that verify migrations don't lose data.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

    it('pre-marks every drizzle journal entry with sha256(sql) — per-module runner contract', async () => {
      // Regression for the Playwright failure (PRD-101 US-09): the schema
      // initializer previously stored migration *tags* in the hash column,
      // which broke the per-module runner's `sha256(sql)` equality check
      // and caused "table `budgets` already exists" on first boot.
      const { createHash } = await import('node:crypto');
      const { readJournal } = await import('./per-module-migrations.js');

      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      initializeSchema(db);

      const recorded = new Set(
        (db.prepare('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]).map(
          (r) => r.hash
        )
      );

      const drizzleDir = join(__dirname, 'drizzle-migrations');
      const journal = readJournal();
      for (const entry of journal.entries) {
        const sql = readFileSync(join(drizzleDir, `${entry.tag}.sql`), 'utf8');
        const expected = createHash('sha256').update(sql).digest('hex');
        expect(recorded.has(expected)).toBe(true);
      }

      db.close();
    });

    it('per-module migration runner is a no-op against a freshly initialized DB', async () => {
      // End-to-end regression: real `initializeSchema` → real per-module
      // runner → zero migrations applied. This is the exact boot path that
      // crashed under Playwright before the fix.
      const { runPerModuleMigrations } = await import('./per-module-migrations.js');
      const { migrationOwners } = await import('./migration-ownership.js');
      const { readJournal } = await import('./per-module-migrations.js');

      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      initializeSchema(db);

      // Build a minimal manifest carrying every owned tag — the runner only
      // needs the install-set + owners to honour the hash short-circuit.
      const journal = readJournal();
      const installedIds = new Set(
        [...migrationOwners.values()].filter((id): id is string => Boolean(id))
      );
      const allTags = journal.entries.map((e) => e.tag);
      const manifests = [...installedIds].map((id) => ({
        id,
        name: id,
        surfaces: ['app'] as const,
        backend: {
          router: {},
          migrations: allTags
            .filter((t) => migrationOwners.get(t) === id)
            .map((id) => ({ id, sql: '' })),
        },
      }));

      const result = runPerModuleMigrations(db, manifests, migrationOwners);

      expect(result.applied).toEqual([]);
      // Every entry whose owner is installed must be a no-op.
      const expectedAlreadyApplied = allTags
        .filter((t) => {
          const owner = migrationOwners.get(t);
          return owner !== undefined && installedIds.has(owner);
        })
        .toSorted();
      expect([...result.alreadyApplied].toSorted()).toEqual(expectedAlreadyApplied);

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
    const byTitle = 'SELECT title FROM movies WHERE title = ?';

    /**
     * The migration only touches the `movies` table — building the full schema
     * via `initializeSchema` was costing ~95ms per case (and growing with every
     * new migration added to the project). Inline the minimal table instead.
     */
    function setupMoviesTable(db: BetterSqlite3.Database): void {
      db.exec(
        'CREATE TABLE movies (tmdb_id INTEGER PRIMARY KEY, title TEXT NOT NULL, genres TEXT)'
      );
    }

    function insertMovie(db: BetterSqlite3.Database, title: string): void {
      db.prepare("INSERT INTO movies (tmdb_id, title, genres) VALUES (?, ?, '[]')").run(1, title);
    }

    it('strips surrounding quotes from a wrapped title', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, '"Wuthering Heights"');
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('Wuthering Heights')).toBeDefined();
      db.close();
    });

    it('does not touch a title with only a leading quote', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, '"Something');
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('"Something')).toBeDefined();
      db.close();
    });

    it('does not touch a title with only a trailing quote', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, 'Something"');
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('Something"')).toBeDefined();
      db.close();
    });

    it('does not touch a title with internal quotes', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, 'Film "Noir" Style');
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('Film "Noir" Style')).toBeDefined();
      db.close();
    });

    it('does not produce an empty title from bare ""', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, '""');
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('""')).toBeDefined();
      db.close();
    });

    it('does not produce an empty title from all-quote string """', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, '"""');
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('"""')).toBeDefined();
      db.close();
    });

    it('does not affect a clean title', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, 'The Dark Knight');
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('The Dark Knight')).toBeDefined();
      db.close();
    });

    it('is idempotent — running twice gives the same result', () => {
      const db = new BetterSqlite3(dbPath);
      setupMoviesTable(db);
      insertMovie(db, '"Wuthering Heights"');
      db.exec(migrationSql);
      db.exec(migrationSql);
      expect(db.prepare(byTitle).get('Wuthering Heights')).toBeDefined();
      expect(db.prepare(byTitle).get('"Wuthering Heights"')).toBeUndefined();
      db.close();
    });
  });

  describe('0051_strip_quoted_tv_show_titles migration (#2403)', () => {
    const migrationSql = `
      UPDATE tv_shows
      SET name = TRIM(name, '"')
      WHERE name LIKE '"%"'
        AND length(name) > 2
        AND TRIM(name, '"') != '';

      UPDATE tv_shows
      SET original_name = TRIM(original_name, '"')
      WHERE original_name LIKE '"%"'
        AND length(original_name) > 2
        AND TRIM(original_name, '"') != '';
    `;
    const byName = 'SELECT name, original_name FROM tv_shows WHERE name = ?';

    /**
     * The migration only touches the `tv_shows` table — building the full
     * schema via `initializeSchema` was costing ~95ms per case (and growing
     * with every new migration added to the project). Inline the minimal
     * table instead.
     */
    function setupTvShowsTable(db: BetterSqlite3.Database): void {
      db.exec(
        'CREATE TABLE tv_shows (tvdb_id INTEGER PRIMARY KEY, name TEXT NOT NULL, original_name TEXT)'
      );
    }

    function insertShow(
      db: BetterSqlite3.Database,
      name: string,
      originalName: string | null = null
    ): void {
      db.prepare('INSERT INTO tv_shows (tvdb_id, name, original_name) VALUES (?, ?, ?)').run(
        1,
        name,
        originalName
      );
    }

    it('strips surrounding quotes from a wrapped name', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, '"The Wire"');
      db.exec(migrationSql);
      expect(db.prepare(byName).get('The Wire')).toBeDefined();
      db.close();
    });

    it('strips surrounding quotes from original_name independently of name', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, 'The Wire', '"The Wire"');
      db.exec(migrationSql);
      const row = db.prepare(byName).get('The Wire') as {
        name: string;
        original_name: string;
      };
      expect(row.original_name).toBe('The Wire');
      db.close();
    });

    it('does not touch a name with only a leading quote', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, '"Something');
      db.exec(migrationSql);
      expect(db.prepare(byName).get('"Something')).toBeDefined();
      db.close();
    });

    it('does not touch a name with only a trailing quote', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, 'Something"');
      db.exec(migrationSql);
      expect(db.prepare(byName).get('Something"')).toBeDefined();
      db.close();
    });

    it('does not touch a name with internal quotes', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, 'Show "Title" Format');
      db.exec(migrationSql);
      expect(db.prepare(byName).get('Show "Title" Format')).toBeDefined();
      db.close();
    });

    it('does not produce an empty name from bare ""', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, '""');
      db.exec(migrationSql);
      expect(db.prepare(byName).get('""')).toBeDefined();
      db.close();
    });

    it('does not produce an empty name from all-quote string """', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, '"""');
      db.exec(migrationSql);
      expect(db.prepare(byName).get('"""')).toBeDefined();
      db.close();
    });

    it('does not affect a clean name', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, 'Breaking Bad');
      db.exec(migrationSql);
      expect(db.prepare(byName).get('Breaking Bad')).toBeDefined();
      db.close();
    });

    it('leaves NULL original_name untouched', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, 'The Sopranos', null);
      db.exec(migrationSql);
      const row = db.prepare(byName).get('The Sopranos') as {
        name: string;
        original_name: string | null;
      };
      expect(row.original_name).toBeNull();
      db.close();
    });

    it('is idempotent — running twice gives the same result', () => {
      const db = new BetterSqlite3(dbPath);
      setupTvShowsTable(db);
      insertShow(db, '"The Wire"', '"The Wire"');
      db.exec(migrationSql);
      db.exec(migrationSql);
      const row = db.prepare(byName).get('The Wire') as {
        name: string;
        original_name: string;
      };
      expect(row.name).toBe('The Wire');
      expect(row.original_name).toBe('The Wire');
      db.close();
    });
  });

  /**
   * PRD-025 #2550: budgets.active originally defaulted to 1 in the table
   * definition while the API CreateBudgetSchema defaulted to 0/false. This
   * migration aligns the DB default with the API default by recreating the
   * `budgets` table (SQLite cannot ALTER COLUMN DEFAULT).
   */
  describe('0052_budgets_active_default_zero migration (#2550)', () => {
    /** Set up a DB that mimics the pre-migration schema (active DEFAULT 1). */
    function setupOldSchema(db: BetterSqlite3.Database): void {
      db.exec(`
        CREATE TABLE budgets (
          id TEXT PRIMARY KEY,
          notion_id TEXT,
          category TEXT NOT NULL,
          period TEXT,
          amount REAL,
          active INTEGER NOT NULL DEFAULT 1,
          notes TEXT,
          last_edited_time TEXT NOT NULL
        );
        CREATE UNIQUE INDEX budgets_notion_id_unique ON budgets(notion_id);
        CREATE UNIQUE INDEX idx_budgets_category_period
          ON budgets(category, COALESCE(period, char(0)));
      `);
    }

    function readMigrationSql(): string {
      return readFileSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'packages',
          'finance-db',
          'migrations',
          '0052_budgets_active_default_zero.sql'
        ),
        'utf8'
      );
    }

    it('flips the DEFAULT for active from 1 to 0', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      setupOldSchema(db);

      // Sanity: pre-migration default is 1
      db.prepare(
        "INSERT INTO budgets(id, category, last_edited_time) VALUES ('pre','Pre','2026-01-01')"
      ).run();
      const before = db.prepare("SELECT active FROM budgets WHERE id='pre'").get() as {
        active: number;
      };
      expect(before.active).toBe(1);

      db.exec(readMigrationSql());

      // Post-migration default is 0
      db.prepare(
        "INSERT INTO budgets(id, category, last_edited_time) VALUES ('post','Post','2026-01-01')"
      ).run();
      const after = db.prepare("SELECT active FROM budgets WHERE id='post'").get() as {
        active: number;
      };
      expect(after.active).toBe(0);

      db.close();
    });

    it('preserves existing rows including their explicit active values', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      setupOldSchema(db);

      const insert = db.prepare(
        'INSERT INTO budgets(id, category, period, amount, active, notes, last_edited_time) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      insert.run('a', 'Groceries', null, 500, 1, null, '2026-01-01');
      insert.run('b', 'Entertainment', 'monthly', 200, 0, 'kept off', '2026-01-01');
      insert.run('c', 'Dining', 'monthly', null, 1, null, '2026-01-01');

      db.exec(readMigrationSql());

      const rows = db
        .prepare('SELECT id, category, period, amount, active, notes FROM budgets ORDER BY id')
        .all() as {
        id: string;
        category: string;
        period: string | null;
        amount: number | null;
        active: number;
        notes: string | null;
      }[];

      expect(rows).toEqual([
        { id: 'a', category: 'Groceries', period: null, amount: 500, active: 1, notes: null },
        {
          id: 'b',
          category: 'Entertainment',
          period: 'monthly',
          amount: 200,
          active: 0,
          notes: 'kept off',
        },
        { id: 'c', category: 'Dining', period: 'monthly', amount: null, active: 1, notes: null },
      ]);

      db.close();
    });

    it('preserves the (category, period) UNIQUE index — including null period', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      setupOldSchema(db);

      db.prepare(
        "INSERT INTO budgets(id, category, last_edited_time) VALUES ('a','Groceries','2026-01-01')"
      ).run();

      db.exec(readMigrationSql());

      // Inserting another row with the same category and null period must fail.
      expect(() =>
        db
          .prepare(
            "INSERT INTO budgets(id, category, last_edited_time) VALUES ('b','Groceries','2026-01-01')"
          )
          .run()
      ).toThrow(/UNIQUE constraint failed/);

      db.close();
    });

    it('preserves the notion_id UNIQUE index', () => {
      const db = new BetterSqlite3(dbPath);
      db.pragma('foreign_keys = ON');
      setupOldSchema(db);

      db.prepare(
        "INSERT INTO budgets(id, notion_id, category, last_edited_time) VALUES ('a','nid-1','Groceries','2026-01-01')"
      ).run();

      db.exec(readMigrationSql());

      expect(() =>
        db
          .prepare(
            "INSERT INTO budgets(id, notion_id, category, last_edited_time) VALUES ('b','nid-1','Other','2026-01-01')"
          )
          .run()
      ).toThrow(/UNIQUE constraint failed/);

      db.close();
    });
  });
});
