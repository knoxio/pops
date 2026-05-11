import { AsyncLocalStorage } from 'node:async_hooks';
import { unlinkSync } from 'node:fs';

import BetterSqlite3 from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';

import { createPreMigrationBackup, isFreshDatabase } from './db/backup.js';
import { migrationOwners } from './db/migration-ownership.js';
import {
  getPendingMigrations,
  hasDrizzleMigrationsTable,
  markDrizzleBaselineMigrationsApplied,
  markDrizzleMigrationsApplied,
  markVecMigrationApplied,
  runMigrations,
} from './db/migrations-runner.js';
import {
  runPerModuleMigrationsByOwner,
  warnOrphanMigrationsByOwner,
} from './db/per-module-migrations.js';
import { initializeSchema } from './db/schema.js';
import { resolveSqlitePath } from './db/sqlite-path.js';
import { isVecAvailable, tryLoadVecExtension } from './db/vec-loader.js';
import { readInstalledModules, type InstalledModules } from './modules/env-modules.js';

let prodDb: BetterSqlite3.Database | null = null;

const asyncDb = new AsyncLocalStorage<BetterSqlite3.Database>();

export { isVecAvailable };

function configureConnection(db: BetterSqlite3.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
}

function ensureEmbeddingsVecTable(db: BetterSqlite3.Database): void {
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_vec USING vec0(vector float[1536])`);
  } catch {
    // Should not happen since vec is loaded, but don't crash
  }
}

function initializeFreshDatabase(db: BetterSqlite3.Database): void {
  console.warn('[db] Fresh database detected — initializing schema...');
  initializeSchema(db);
  markDrizzleMigrationsApplied(db);
  console.warn('[db] Schema initialized successfully.');
}

function applyManualMigrations(db: BetterSqlite3.Database, dbPath: string): void {
  const pending = getPendingMigrations(db);
  if (pending.length === 0) return;

  const backupPath = createPreMigrationBackup(db, dbPath, pending.length);
  try {
    runMigrations(db);
  } catch (err) {
    if (backupPath) console.error(`[db] Migration failed. Backup available at: ${backupPath}`);
    throw err;
  }
  if (backupPath) {
    try {
      unlinkSync(backupPath);
    } catch {
      // Non-fatal
    }
  }
}

function isVecMigrationError(err: unknown): err is Error {
  return (
    err instanceof Error && (err.message.includes('vec0') || err.message.includes('embeddings_vec'))
  );
}

/**
 * Build the install-set of module ids (core + installed apps + installed
 * overlays). Centralised because both the migration runner and the
 * orphan-warning path need the same view of which modules are installed.
 */
function makeInstalledIds(installed: InstalledModules): Set<string> {
  return new Set<string>(['core', ...installed.apps, ...installed.overlays]);
}

/**
 * Apply drizzle journal entries owned by the current install set.
 *
 * Replaces the historical `migrate(drizzleDb, { migrationsFolder })` call:
 * the global drizzle migrator ran every journal entry regardless of which
 * modules were installed, which contradicts the PRD-101 partial-install
 * contract (absent modules should not leave their tables on disk). The
 * per-module runner walks the journal in order and skips entries whose
 * owning module is not in `installedIds`. Already-applied entries (matched
 * by `sha256(sql)` against `__drizzle_migrations`) are treated as no-ops,
 * preserving compatibility with databases bootstrapped by the pre-PRD-101
 * runtime.
 *
 * Reads the install set from `readInstalledModules()` instead of the live
 * manifest graph — see the note on `warnAbsentModuleMigrations` below for
 * why the manifests can't be imported here.
 */
function applyDrizzleMigrations(db: BetterSqlite3.Database, vecLoaded: boolean): void {
  try {
    if (!hasDrizzleMigrationsTable(db)) {
      markDrizzleBaselineMigrationsApplied(db);
    }
    const installedIds = makeInstalledIds(readInstalledModules());
    runPerModuleMigrationsByOwner(db, installedIds, migrationOwners);
  } catch (err) {
    if (!vecLoaded && isVecMigrationError(err)) {
      console.error(
        '[db] embeddings_vec migration skipped (sqlite-vec unavailable) — marking as applied, vector features disabled'
      );
      markVecMigrationApplied(db);
      return;
    }
    console.error('[db] Drizzle migration failed:', err);
    throw err;
  }
}

/**
 * Warn about migrations recorded in `__drizzle_migrations` whose owning
 * module is not in the current install set (`POPS_APPS` / `POPS_OVERLAYS`).
 * Data is preserved; the warning is operator info only (PRD-101 US-09).
 *
 * Reads the install set via `readInstalledModules()` rather than the live
 * manifest graph — manifest exports transitively import `db.ts` via their
 * tRPC routers, so pulling them here would create an import cycle.
 */
function warnAbsentModuleMigrations(db: BetterSqlite3.Database): void {
  try {
    const installedIds = makeInstalledIds(readInstalledModules());
    warnOrphanMigrationsByOwner(db, installedIds, migrationOwners);
  } catch (err) {
    // Non-fatal — the warning is informational; if env parsing fails the
    // boot path will surface the same error through `readInstalledModules`
    // when other consumers call it.
    console.warn('[db] Could not compute orphan-migration warning:', err);
  }
}

function openDatabase(path: string): BetterSqlite3.Database {
  const db = new BetterSqlite3(path);
  configureConnection(db);

  const vecLoaded = tryLoadVecExtension(db);
  if (vecLoaded) ensureEmbeddingsVecTable(db);

  if (isFreshDatabase(db)) {
    initializeFreshDatabase(db);
    // Skip orphan detection on first boot — `initializeFreshDatabase()` just
    // recorded every drizzle tag as applied, so a partial install would
    // otherwise emit spurious orphan warnings on a database that has never
    // had any module's data on disk.
    return db;
  }

  // Drizzle migrations must run before manual migrations so that the base
  // tables they depend on (e.g. `entities`, `transactions`) exist when the
  // manual runner tries to apply migrations that reference them.
  // Previously this order was reversed, causing a "no such table" crash on
  // tsx hot-reload when a manual migration (e.g. 007_transaction_corrections)
  // had not yet been applied and the referenced table was only created by
  // Drizzle. (#2375)
  applyDrizzleMigrations(db, vecLoaded);
  applyManualMigrations(db, path);
  warnAbsentModuleMigrations(db);
  return db;
}

/**
 * Get the database for the current request context.
 *
 * - Inside an `withEnvDb()` scope: returns the environment-scoped DB.
 * - Otherwise: returns the prod singleton.
 */
export function getDb(): BetterSqlite3.Database {
  return asyncDb.getStore() ?? getProdDb();
}

export function isNamedEnvContext(): boolean {
  return asyncDb.getStore() !== undefined;
}

function getProdDb(): BetterSqlite3.Database {
  if (!prodDb) {
    prodDb = openDatabase(resolveSqlitePath());
  }
  return prodDb;
}

export function withEnvDb<T>(db: BetterSqlite3.Database, fn: () => T): T {
  return asyncDb.run(db, fn);
}

export function openEnvDatabase(path: string): BetterSqlite3.Database {
  const db = new BetterSqlite3(path);
  configureConnection(db);
  tryLoadVecExtension(db);
  initializeSchema(db);
  return db;
}

export function closeDb(): void {
  if (prodDb) {
    prodDb.close();
    prodDb = null;
  }
}

export function setDb(newDb: BetterSqlite3.Database): BetterSqlite3.Database | null {
  const prev = prodDb;
  prodDb = newDb;
  return prev;
}

export function getDrizzle(): BetterSQLite3Database {
  return drizzle(getDb());
}

export type { BetterSQLite3Database };
