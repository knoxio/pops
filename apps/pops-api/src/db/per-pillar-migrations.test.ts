/**
 * Per-pillar migration runner tests (P1).
 *
 * Stubs a tmp repoRoot with synthetic pillar `<id>-db/migrations/` dirs and
 * journals, then drives the runner against an in-memory SQLite database.
 * `resolveInstalledPackage` is forced to `null` so the workspace fallback
 * (repoRoot-based) path is exercised — there's a dedicated test for the
 * installed-package branch that injects a stub.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPerPillarMigrations } from './per-pillar-migrations.js';

import type { PillarDescriptor } from './known-pillars.js';

let repoRoot: string;
let dbPath: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'per-pillar-mig-'));
  dbPath = join(repoRoot, 'test.db');
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function pillar(id: string): PillarDescriptor {
  return { id, dbPackageDir: `packages/${id}-db` };
}

/** Default options used by the workspace-fallback tests. */
function workspaceOpts(): {
  repoRoot: string;
  resolveInstalledPackage: () => null;
} {
  return { repoRoot, resolveInstalledPackage: () => null };
}

function writePillarJournal(
  pillarId: string,
  tags: readonly { tag: string; sql: string }[]
): string {
  const dir = join(repoRoot, `packages/${pillarId}-db`, 'migrations');
  mkdirSync(join(dir, 'meta'), { recursive: true });
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
  return dir;
}

async function withDb<T>(run: (db: BetterSqlite3.Database) => T | Promise<T>): Promise<T> {
  const db = new BetterSqlite3(dbPath);
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

describe('runPerPillarMigrations', () => {
  it('is a no-op when no pillar has a journal yet', async () => {
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core'), pillar('food')], workspaceOpts());
      expect(result.applied).toEqual([]);
      expect(result.backfilled).toEqual([]);
      expect(result.alreadyApplied).toEqual([]);
      expect(result.pillarsApplied).toEqual([]);
      expect(result.pillarsSkipped).toEqual(['core', 'food']);

      // No tracking tables should be created when there's nothing to do.
      const trackingTables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('__drizzle_migrations', '__pops_migration_tags')"
        )
        .all() as { name: string }[];
      expect(trackingTables).toEqual([]);
    });
  });

  it('applies a single pillar journal end-to-end', async () => {
    writePillarJournal('core', [
      { tag: '0001_core_settings', sql: 'CREATE TABLE settings (key TEXT PRIMARY KEY);' },
      { tag: '0002_core_sync_logs', sql: 'CREATE TABLE sync_logs (id INTEGER PRIMARY KEY);' },
    ]);
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core'), pillar('food')], workspaceOpts());
      expect(result.applied).toEqual(['0001_core_settings', '0002_core_sync_logs']);
      expect(result.pillarsApplied).toEqual(['core']);
      expect(result.pillarsSkipped).toEqual(['food']);

      const names = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((r) => r.name);
      expect(names).toContain('settings');
      expect(names).toContain('sync_logs');
    });
  });

  it('is idempotent — second run reports alreadyApplied without re-applying SQL', async () => {
    writePillarJournal('core', [
      { tag: '0001_core_only', sql: 'CREATE TABLE only_once (id INTEGER);' },
    ]);
    await withDb((db) => {
      const first = runPerPillarMigrations(db, [pillar('core')], workspaceOpts());
      expect(first.applied).toEqual(['0001_core_only']);
      // Insert a sentinel row; the migration would crash on re-run if the
      // CREATE TABLE re-fired without backfill recovery — but the cache
      // skip should keep the table untouched.
      db.exec('INSERT INTO only_once (id) VALUES (1)');

      const second = runPerPillarMigrations(db, [pillar('core')], workspaceOpts());
      expect(second.applied).toEqual([]);
      expect(second.alreadyApplied).toEqual(['0001_core_only']);

      const row = db.prepare('SELECT id FROM only_once').get() as { id: number };
      expect(row.id).toBe(1);
    });
  });

  it('applies multiple pillars in the order they appear in the input list', async () => {
    writePillarJournal('core', [{ tag: '0001_core', sql: 'CREATE TABLE core_t (id INTEGER);' }]);
    writePillarJournal('food', [{ tag: '0001_food', sql: 'CREATE TABLE food_t (id INTEGER);' }]);
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core'), pillar('food')], workspaceOpts());
      expect(result.applied).toEqual(['0001_core', '0001_food']);
      expect(result.pillarsApplied).toEqual(['core', 'food']);
      expect(result.pillarsSkipped).toEqual([]);
    });
  });

  it('skips a pillar whose journal exists but is empty', async () => {
    writePillarJournal('core', []);
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core')], workspaceOpts());
      expect(result.applied).toEqual([]);
      expect(result.pillarsApplied).toEqual([]);
      expect(result.pillarsSkipped).toEqual(['core']);
    });
  });

  it('prefers the installed-package resolver when it returns a path', async () => {
    // Stub an "installed" package at <repoRoot>/installed/core-db; write
    // its migrations there. The workspace fallback path is intentionally
    // left empty so the test fails if the resolver isn't consulted first.
    const installedPkgRoot = join(repoRoot, 'installed', 'core-db');
    mkdirSync(join(installedPkgRoot, 'migrations', 'meta'), { recursive: true });
    writeFileSync(
      join(installedPkgRoot, 'migrations', 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [
          {
            idx: 0,
            version: '7',
            when: 1,
            tag: '0001_from_installed',
            breakpoints: true,
          },
        ],
      })
    );
    writeFileSync(
      join(installedPkgRoot, 'migrations', '0001_from_installed.sql'),
      'CREATE TABLE installed_marker (id INTEGER);'
    );
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core')], {
        repoRoot,
        resolveInstalledPackage: (id) => (id === 'core' ? installedPkgRoot : null),
      });
      expect(result.applied).toEqual(['0001_from_installed']);
      expect(result.pillarsApplied).toEqual(['core']);

      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((t) => t.name);
      expect(tables).toContain('installed_marker');
    });
  });

  it('falls back to the real repo root when no override is supplied', async () => {
    // Smoke check: importing the runner under the real layout shouldn't
    // crash on the (currently absent) `packages/<id>-db/migrations/` dirs.
    // Every pillar should land in `pillarsSkipped`.
    await withDb((db) => {
      const realPillars: PillarDescriptor[] = [{ id: 'core', dbPackageDir: 'packages/core-db' }];
      const result = runPerPillarMigrations(db, realPillars);
      expect(result.applied).toEqual([]);
      expect(result.pillarsSkipped).toEqual(['core']);
    });
  });
});
