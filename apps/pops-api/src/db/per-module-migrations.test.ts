/**
 * Synthetic manifests + journal entries are written to a temp dir so tests
 * don't depend on the live ownership map evolving over time.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installedMigrationTags, migrationOwnershipMap } from './per-module-migrations.js';

import type { ModuleManifest } from '@pops/types';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'per-module-mig-'));
  dbPath = join(tmpDir, 'test.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  // `vi.restoreAllMocks()` clears spies but does NOT purge module mocks
  // installed via `vi.doMock`. Without `vi.doUnmock` the mock for
  // `./migrations-runner.js` survives into the next test in the same
  // worker, so a later import of `per-module-migrations.js` would resolve
  // the cached mock pointing at a `tmpDir` already removed above — making
  // test order load-bearing. Reset the module registry too so any cached
  // `per-module-migrations.js` binding from a previous test is dropped.
  vi.doUnmock('./migrations-runner.js');
  vi.resetModules();
  vi.restoreAllMocks();
});

function makeManifest(id: string, migrations: { id: string; sql: string }[]): ModuleManifest {
  return {
    id,
    name: id,
    surfaces: ['app'] as const,
    backend: { router: {}, migrations },
  };
}

function fakeJournalDir(): string {
  const dir = join(tmpDir, 'drizzle-migrations');
  mkdirSync(join(dir, 'meta'), { recursive: true });
  return dir;
}

function writeJournal(dir: string, tags: readonly { tag: string; sql: string }[]): void {
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: tags.map((t, i) => ({
        idx: i,
        version: '7',
        when: 1_000_000 + i,
        tag: t.tag,
        breakpoints: true,
      })),
    })
  );
  for (const t of tags) {
    writeFileSync(join(dir, `${t.tag}.sql`), t.sql);
  }
}

/**
 * Guarantees the DB handle is closed even if an assertion fails — otherwise
 * a leaked handle can keep the temp dir busy on Windows / make subsequent
 * tests flaky. Awaits async callbacks before closing so the handle remains
 * valid for the duration of the callback.
 */
async function withDb<T>(run: (db: BetterSqlite3.Database) => T | Promise<T>): Promise<T> {
  const db = new BetterSqlite3(dbPath);
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

async function loadRunnerWithJournalDir(
  drizzleDir: string
): Promise<typeof import('./per-module-migrations.js')> {
  vi.resetModules();
  vi.doMock('./migrations-runner.js', async () => {
    const actual =
      await vi.importActual<typeof import('./migrations-runner.js')>('./migrations-runner.js');
    return { ...actual, DRIZZLE_MIGRATIONS_DIRECTORY: drizzleDir };
  });
  return import('./per-module-migrations.js');
}

describe('installedMigrationTags', () => {
  it('returns union of every module manifests migration ids', () => {
    const a = makeManifest('a', [
      { id: 'a_1', sql: '' },
      { id: 'a_2', sql: '' },
    ]);
    const b = makeManifest('b', [{ id: 'b_1', sql: '' }]);
    const tags = installedMigrationTags([a, b]);
    expect([...tags].toSorted()).toEqual(['a_1', 'a_2', 'b_1']);
  });

  it('returns empty set when no module declares migrations', () => {
    const a: ModuleManifest = { id: 'a', name: 'a', surfaces: ['app'] };
    expect(installedMigrationTags([a]).size).toBe(0);
  });
});

describe('migrationOwnershipMap', () => {
  it('maps each tag to its owning module id', () => {
    const a = makeManifest('a', [{ id: 'a_1', sql: '' }]);
    const b = makeManifest('b', [{ id: 'b_1', sql: '' }]);
    const owners = migrationOwnershipMap([a, b]);
    expect(owners.get('a_1')).toBe('a');
    expect(owners.get('b_1')).toBe('b');
    expect(owners.size).toBe(2);
  });

  it('throws if two modules claim the same migration tag', () => {
    const a = makeManifest('a', [{ id: 'shared_tag', sql: '' }]);
    const b = makeManifest('b', [{ id: 'shared_tag', sql: '' }]);
    expect(() => migrationOwnershipMap([a, b])).toThrow(
      /Migration tag "shared_tag" is declared by both "a" and "b"\./
    );
  });
});

describe('runPerModuleMigrations', () => {
  it('applies only migrations owned by installed modules', async () => {
    const dir = fakeJournalDir();
    writeJournal(dir, [
      { tag: '001_a_setup', sql: 'CREATE TABLE a (id INTEGER);' },
      { tag: '002_b_setup', sql: 'CREATE TABLE b (id INTEGER);' },
      { tag: '003_a_extra', sql: 'CREATE TABLE a_extra (id INTEGER);' },
    ]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const a = makeManifest('a', [
        { id: '001_a_setup', sql: 'CREATE TABLE a (id INTEGER);' },
        { id: '003_a_extra', sql: 'CREATE TABLE a_extra (id INTEGER);' },
      ]);
      const b = makeManifest('b', [{ id: '002_b_setup', sql: 'CREATE TABLE b (id INTEGER);' }]);

      const knownOwners = mod.migrationOwnershipMap([a, b]);
      const result = mod.runPerModuleMigrations(db, [a], knownOwners);

      expect(result.applied).toEqual(['001_a_setup', '003_a_extra']);
      expect(result.skipped).toEqual(['002_b_setup']);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain('a');
      expect(names).toContain('a_extra');
      expect(names).not.toContain('b');

      const second = mod.runPerModuleMigrations(db, [a], knownOwners);
      expect(second.applied).toEqual([]);
      expect(second.skipped).toEqual(['002_b_setup']);
      expect(second.alreadyApplied).toEqual(['001_a_setup', '003_a_extra']);

      const third = mod.runPerModuleMigrations(db, [a, b], knownOwners);
      expect(third.applied).toEqual(['002_b_setup']);
      expect(third.skipped).toEqual([]);
      expect(third.alreadyApplied).toEqual(['001_a_setup', '003_a_extra']);

      const tablesAfter = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      expect(tablesAfter.map((t) => t.name)).toContain('b');
    });
  });

  it('does not record skipped migrations in __drizzle_migrations', async () => {
    const dir = fakeJournalDir();
    writeJournal(dir, [
      { tag: '001_a', sql: 'CREATE TABLE x (id INTEGER);' },
      { tag: '002_b', sql: 'CREATE TABLE y (id INTEGER);' },
    ]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const a = makeManifest('a', [{ id: '001_a', sql: 'CREATE TABLE x (id INTEGER);' }]);
      const b = makeManifest('b', [{ id: '002_b', sql: 'CREATE TABLE y (id INTEGER);' }]);
      const knownOwners = mod.migrationOwnershipMap([a, b]);

      mod.runPerModuleMigrations(db, [a], knownOwners);

      const recorded = db.prepare('SELECT COUNT(*) AS cnt FROM __drizzle_migrations').get() as {
        cnt: number;
      };
      expect(recorded.cnt).toBe(1);
    });
  });

  it('reports unowned tags without applying them', async () => {
    const dir = fakeJournalDir();
    writeJournal(dir, [
      { tag: '001_orphan', sql: 'CREATE TABLE orphan_t (id INTEGER);' },
      { tag: '002_a', sql: 'CREATE TABLE a (id INTEGER);' },
    ]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const a = makeManifest('a', [{ id: '002_a', sql: 'CREATE TABLE a (id INTEGER);' }]);

      const result = mod.runPerModuleMigrations(db, [a]);

      expect(result.applied).toEqual(['002_a']);
      expect(result.unowned).toEqual(['001_orphan']);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[];
      expect(tables.map((t) => t.name)).not.toContain('orphan_t');
    });
  });

  it('refreshes the applied-hash cache after each insert (handles identical SQL bodies)', async () => {
    // Drizzle generates duplicate-SQL entries for idempotent re-creation
    // migrations; without the cache update the second entry would re-execute
    // and crash on non-idempotent statements.
    const dir = fakeJournalDir();
    const sharedSql = 'CREATE TABLE IF NOT EXISTS shared_t (id INTEGER);';
    writeJournal(dir, [
      { tag: '001_first', sql: sharedSql },
      { tag: '002_second', sql: sharedSql },
    ]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const a = makeManifest('a', [
        { id: '001_first', sql: sharedSql },
        { id: '002_second', sql: sharedSql },
      ]);

      const result = mod.runPerModuleMigrations(db, [a]);

      expect(result.applied).toEqual(['001_first']);
      expect(result.alreadyApplied).toEqual(['002_second']);
    });
  });

  it('exposes a by-owner variant for boot-time use', async () => {
    const dir = fakeJournalDir();
    writeJournal(dir, [
      { tag: '001_a', sql: 'CREATE TABLE a (id INTEGER);' },
      { tag: '002_b', sql: 'CREATE TABLE b (id INTEGER);' },
    ]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const owners = new Map([
        ['001_a', 'a'],
        ['002_b', 'b'],
      ]);
      const installedIds = new Set(['a']);

      const result = mod.runPerModuleMigrationsByOwner(db, installedIds, owners);

      expect(result.applied).toEqual(['001_a']);
      expect(result.skipped).toEqual(['002_b']);
    });
  });

  it('honours --> statement-breakpoint markers in migration SQL', async () => {
    const dir = fakeJournalDir();
    const breakpointSql = [
      'CREATE TABLE alpha (id INTEGER);',
      '--> statement-breakpoint',
      'CREATE TABLE beta (id INTEGER);',
    ].join('\n');
    writeJournal(dir, [{ tag: '001_multi', sql: breakpointSql }]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const a = makeManifest('a', [{ id: '001_multi', sql: breakpointSql }]);

      const result = mod.runPerModuleMigrations(db, [a]);

      expect(result.applied).toEqual(['001_multi']);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });
  });

  it('treats every journal entry as already applied when __drizzle_migrations records sha256(sql) per entry (fresh-DB pre-seed contract)', async () => {
    // Regression for the Playwright E2E failure where `pnpm dev:init` ran
    // `initializeSchema` (which creates every table) and then the API boot
    // path invoked the per-module runner — the previous schema initializer
    // stored migration *tags* in the hash column, so the runner re-attempted
    // every journal entry and crashed on "table `budgets` already exists".
    // After the fix, `initializeSchema` records `sha256(sql)` per entry, so
    // the runner observes a full hash match and applies nothing.
    //
    // This test exercises the runner directly with the same hashing
    // convention `markDrizzleMigrationsApplied` now uses; if the runner ever
    // drifts away from `sha256(sql)` the fresh-DB-then-migrate path will
    // regress and this assertion will trip.
    const { createHash } = await import('node:crypto');
    const dir = fakeJournalDir();
    const sqls = [
      'CREATE TABLE budgets (id INTEGER);',
      'CREATE TABLE entities (id INTEGER);',
      'CREATE TABLE transactions (id INTEGER);',
    ];
    const tags = sqls.map((_, i) => `000${i}_seeded`);
    writeJournal(
      dir,
      sqls.map((sql, i) => ({ tag: tags[i] ?? '', sql }))
    );
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      // Create the tables (mirrors `initializeSchema`).
      for (const sql of sqls) db.exec(sql);
      // Pre-seed __drizzle_migrations with sha256(sql) — the contract that
      // `markDrizzleMigrationsApplied` (and the per-module runner) agrees on.
      db.exec(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL,
          created_at NUMERIC
        )
      `);
      const insert = db.prepare(
        'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)'
      );
      for (const sql of sqls) {
        insert.run(createHash('sha256').update(sql).digest('hex'), Date.now());
      }

      const a = makeManifest(
        'core',
        sqls.map((sql, i) => ({ id: tags[i] ?? '', sql }))
      );
      const knownOwners = mod.migrationOwnershipMap([a]);

      const result = mod.runPerModuleMigrations(db, [a], knownOwners);

      expect(result.applied).toEqual([]);
      expect(result.alreadyApplied).toEqual(tags);
      expect(result.skipped).toEqual([]);
      expect(result.unowned).toEqual([]);
    });
  });

  it('backfills the hash when __drizzle_migrations has stale tag-as-hash entries (auto-heals legacy schema-init bug)', async () => {
    // Regression for the prod outage where __drizzle_migrations contained
    // tag names instead of sha256(sql) hashes (pre-PRD-101 schema-init bug,
    // and a separate prod incident where 11 migrations had been applied via
    // initializeSchema(db) but were absent from __drizzle_migrations).
    // Either way, the runner sees the hash as missing and re-runs the
    // migration, which crashes on `table X already exists`. The contract
    // now: detect "already applied" SQLite errors, record the correct hash
    // so subsequent boots short-circuit, bucket the tag as `backfilled`
    // (not `applied`) so the operator sees the divergence.
    const dir = fakeJournalDir();
    const sql = 'CREATE TABLE budgets (id INTEGER);';
    writeJournal(dir, [{ tag: '0000_seeded', sql }]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      db.exec(sql);
      db.exec(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL,
          created_at NUMERIC
        )
      `);
      // Stale: tag in the hash column instead of sha256(sql).
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        '0000_seeded',
        Date.now()
      );

      const a = makeManifest('core', [{ id: '0000_seeded', sql }]);
      const knownOwners = mod.migrationOwnershipMap([a]);

      const result = mod.runPerModuleMigrations(db, [a], knownOwners);

      expect(result.applied).toEqual([]);
      expect(result.backfilled).toEqual(['0000_seeded']);

      // The correct hash is now recorded — subsequent boots short-circuit
      // at `knownHashes.has(hash)` and treat the tag as alreadyApplied.
      const second = mod.runPerModuleMigrations(db, [a], knownOwners);
      expect(second.applied).toEqual([]);
      expect(second.backfilled).toEqual([]);
      expect(second.alreadyApplied).toEqual(['0000_seeded']);
    });
  });

  it('backfills hashes for the multi-statement partial-divergence case', async () => {
    // Some statements already applied, some not. Runner should skip the
    // applied ones, run the new ones, and record the hash. Bucket: backfilled.
    const dir = fakeJournalDir();
    const sql = [
      'CREATE TABLE pre_existing (id INTEGER);',
      '--> statement-breakpoint',
      'CREATE TABLE genuinely_new (id INTEGER);',
    ].join('\n');
    writeJournal(dir, [{ tag: '0000_partial', sql }]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      db.exec('CREATE TABLE pre_existing (id INTEGER);');

      const a = makeManifest('core', [{ id: '0000_partial', sql }]);

      const result = mod.runPerModuleMigrations(db, [a]);

      expect(result.applied).toEqual([]);
      expect(result.backfilled).toEqual(['0000_partial']);

      // Both tables present: pre_existing untouched, genuinely_new created.
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain('pre_existing');
      expect(names).toContain('genuinely_new');
    });
  });

  it('does NOT backfill on inverse errors (no such table / no such column)', async () => {
    // The schema is missing something the migration assumed was there.
    // That's a true precondition failure — must surface, not silently pass.
    const dir = fakeJournalDir();
    const sql = 'DROP TABLE never_existed;';
    writeJournal(dir, [{ tag: '0000_drop_missing', sql }]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const a = makeManifest('core', [{ id: '0000_drop_missing', sql }]);

      expect(() => mod.runPerModuleMigrations(db, [a])).toThrow(/no such table/i);

      const recorded = db.prepare('SELECT COUNT(*) AS cnt FROM __drizzle_migrations').get() as {
        cnt: number;
      };
      expect(recorded.cnt).toBe(0);
    });
  });

  it('treats every "already exists" variant as backfillable (table / index / duplicate column)', async () => {
    const dir = fakeJournalDir();
    const sql = [
      'CREATE TABLE existing_t (id INTEGER, existing_col TEXT);',
      '--> statement-breakpoint',
      'CREATE INDEX existing_idx ON existing_t (id);',
      '--> statement-breakpoint',
      'ALTER TABLE existing_t ADD COLUMN existing_col TEXT;',
    ].join('\n');
    writeJournal(dir, [{ tag: '0000_mixed', sql }]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      // Pre-create everything the migration is about to (re)declare.
      db.exec('CREATE TABLE existing_t (id INTEGER, existing_col TEXT);');
      db.exec('CREATE INDEX existing_idx ON existing_t (id);');

      const a = makeManifest('core', [{ id: '0000_mixed', sql }]);

      const result = mod.runPerModuleMigrations(db, [a]);

      expect(result.backfilled).toEqual(['0000_mixed']);
      expect(result.applied).toEqual([]);
    });
  });
});

describe('warnOrphanMigrations', () => {
  it('warns on each recorded migration whose owning module is absent', async () => {
    const dir = fakeJournalDir();
    writeJournal(dir, [
      { tag: '001_a', sql: 'CREATE TABLE x (id INTEGER);' },
      { tag: '002_b', sql: 'CREATE TABLE y (id INTEGER);' },
    ]);
    const mod = await loadRunnerWithJournalDir(dir);

    const { logger } = await import('../lib/logger.js');

    await withDb(async (db) => {
      const a = makeManifest('a', [{ id: '001_a', sql: 'CREATE TABLE x (id INTEGER);' }]);
      const b = makeManifest('b', [{ id: '002_b', sql: 'CREATE TABLE y (id INTEGER);' }]);

      const knownOwners = mod.migrationOwnershipMap([a, b]);

      mod.runPerModuleMigrations(db, [a, b], knownOwners);

      const warnSpy = vi.spyOn(logger, 'warn');

      const orphans = mod.warnOrphanMigrations(db, [a], knownOwners);

      expect(orphans).toEqual(['002_b']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [payload] = warnSpy.mock.calls[0] ?? [];
      expect(payload).toMatchObject({ orphanMigrations: ['002_b'] });
    });
  });

  it('does not warn when every recorded migration is owned by an installed module', async () => {
    const dir = fakeJournalDir();
    writeJournal(dir, [{ tag: '001_a', sql: 'CREATE TABLE x (id INTEGER);' }]);
    const mod = await loadRunnerWithJournalDir(dir);

    const { logger } = await import('../lib/logger.js');

    await withDb(async (db) => {
      const a = makeManifest('a', [{ id: '001_a', sql: 'CREATE TABLE x (id INTEGER);' }]);

      mod.runPerModuleMigrations(db, [a]);

      const warnSpy = vi.spyOn(logger, 'warn');
      const orphans = mod.warnOrphanMigrations(db, [a]);

      expect(orphans).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  it('suppresses orphan warnings for tags whose SQL hash collides with another journal entry (duplicate-SQL ambiguity)', async () => {
    // Two modules ship a migration with byte-identical SQL bodies (e.g. an
    // idempotent `CREATE TABLE IF NOT EXISTS` pattern). When only module A
    // is installed and its tag is applied, `__drizzle_migrations` records
    // one hash that maps to BOTH journal entries — there is no way to tell
    // which tag was actually applied. Without ambiguity handling the orphan
    // path would flag module B's tag as an orphan even though it never ran.
    // The apply path already tolerates this collision (the second duplicate
    // becomes `alreadyApplied`); the warning path must match.
    const dir = fakeJournalDir();
    const sharedSql = 'CREATE TABLE IF NOT EXISTS shared_t (id INTEGER);';
    writeJournal(dir, [
      { tag: '001_a_shared', sql: sharedSql },
      { tag: '002_b_shared', sql: sharedSql },
    ]);
    const mod = await loadRunnerWithJournalDir(dir);

    const { logger } = await import('../lib/logger.js');

    await withDb(async (db) => {
      const a = makeManifest('a', [{ id: '001_a_shared', sql: sharedSql }]);
      const b = makeManifest('b', [{ id: '002_b_shared', sql: sharedSql }]);

      const knownOwners = mod.migrationOwnershipMap([a, b]);

      // Install only A — its tag applies, then B's duplicate-hash tag is
      // observed as `alreadyApplied` because the hash is now present.
      const applyResult = mod.runPerModuleMigrations(db, [a], knownOwners);
      expect(applyResult.applied).toEqual(['001_a_shared']);

      const warnSpy = vi.spyOn(logger, 'warn');

      // Now ask the orphan path: with only A installed, is B's tag orphaned?
      // It must NOT be — the hash is ambiguous and could equally belong to A.
      const orphans = mod.warnOrphanMigrations(db, [a], knownOwners);

      expect(orphans).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('hash drift (issue #2610)', () => {
  it('skips the re-run when a migration file is edited after apply', async () => {
    const { createHash } = await import('node:crypto');
    const dir = fakeJournalDir();
    const originalSql = [
      'CREATE TABLE renamed_t (id INTEGER, new_col TEXT);',
      '--> statement-breakpoint',
      // The "one-way" statement that would fail if re-run on a DB where
      // the migration already took effect (old_col no longer exists).
      'UPDATE renamed_t SET new_col = old_col WHERE old_col IS NOT NULL;',
    ].join('\n');
    writeJournal(dir, [{ tag: '0034_rename', sql: originalSql }]);
    const originalHash = createHash('sha256').update(originalSql).digest('hex');

    // Now edit the file (a comment fix — body changes, hash differs) and
    // re-run with the post-edit content visible to the runner.
    const editedSql = `-- minor comment fix\n${originalSql}`;
    writeFileSync(join(dir, '0034_rename.sql'), editedSql);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      // Pre-create the schema in its post-migration shape (no `old_col`)
      // and record the migration as already applied under its ORIGINAL
      // hash + tag — i.e. the state a real DB would be in after a normal
      // apply followed by an unrelated edit to the SQL file.
      db.exec('CREATE TABLE renamed_t (id INTEGER, new_col TEXT);');
      db.exec(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL,
          created_at NUMERIC
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS "__pops_migration_tags" (
          tag TEXT PRIMARY KEY,
          hash TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `);
      const now = Date.now();
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        originalHash,
        now
      );
      db.prepare('INSERT INTO __pops_migration_tags (tag, hash, applied_at) VALUES (?, ?, ?)').run(
        '0034_rename',
        originalHash,
        now
      );

      // Boot the runner against the edited SQL. It must NOT re-execute the
      // UPDATE — that would throw `no such column: old_col`. The tag is on
      // file, the hash drifted, the migration's effects are already in the
      // schema. Detect drift, skip re-run.
      const editedA = makeManifest('a', [{ id: '0034_rename', sql: editedSql }]);
      const result = mod.runPerModuleMigrations(db, [editedA]);

      expect(result.applied).toEqual([]);
      expect(result.alreadyApplied).toEqual(['0034_rename']);
    });
  });

  it('backfills __pops_migration_tags from existing __drizzle_migrations on first boot after upgrade', async () => {
    const { createHash } = await import('node:crypto');
    const dir = fakeJournalDir();
    const sql = 'CREATE TABLE legacy_t (id INTEGER);';
    writeJournal(dir, [{ tag: '0010_legacy', sql }]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      // DB applied this migration under the old hash-only tracking.
      db.exec(sql);
      db.exec(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL,
          created_at NUMERIC
        )
      `);
      const hash = createHash('sha256').update(sql).digest('hex');
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        hash,
        Date.now()
      );

      const a = makeManifest('a', [{ id: '0010_legacy', sql }]);
      const result = mod.runPerModuleMigrations(db, [a]);

      expect(result.alreadyApplied).toEqual(['0010_legacy']);

      // Tag table has been backfilled.
      const tagRow = db
        .prepare('SELECT tag, hash FROM __pops_migration_tags WHERE tag = ?')
        .get('0010_legacy') as { tag: string; hash: string } | undefined;
      expect(tagRow).toBeDefined();
      expect(tagRow?.hash).toBe(hash);
    });
  });

  it('records the tag alongside the hash on every fresh apply', async () => {
    const dir = fakeJournalDir();
    const sql = 'CREATE TABLE fresh_t (id INTEGER);';
    writeJournal(dir, [{ tag: '0001_fresh', sql }]);
    const mod = await loadRunnerWithJournalDir(dir);

    await withDb((db) => {
      const a = makeManifest('a', [{ id: '0001_fresh', sql }]);
      mod.runPerModuleMigrations(db, [a]);

      const rows = db.prepare('SELECT tag, hash FROM __pops_migration_tags').all() as {
        tag: string;
        hash: string;
      }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tag).toBe('0001_fresh');
    });
  });
});
