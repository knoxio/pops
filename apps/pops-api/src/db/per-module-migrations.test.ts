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
});
