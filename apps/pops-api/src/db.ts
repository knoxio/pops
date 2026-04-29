import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, unlinkSync } from 'node:fs';

import BetterSqlite3 from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { createPreMigrationBackup, isFreshDatabase } from './db/backup.js';
import {
  DRIZZLE_MIGRATIONS_DIRECTORY,
  getPendingMigrations,
  hasDrizzleMigrationsTable,
  markDrizzleBaselineMigrationsApplied,
  markDrizzleMigrationsApplied,
  markVecMigrationApplied,
  runMigrations,
} from './db/migrations-runner.js';
import { initializeSchema } from './db/schema.js';
import { isVecAvailable, tryLoadVecExtension } from './db/vec-loader.js';

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

function applyDrizzleMigrations(db: BetterSqlite3.Database, vecLoaded: boolean): void {
  try {
    if (!hasDrizzleMigrationsTable(db)) {
      markDrizzleBaselineMigrationsApplied(db);
    }
    const drizzleDb = drizzle(db);
    migrate(drizzleDb, { migrationsFolder: DRIZZLE_MIGRATIONS_DIRECTORY });
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

function openDatabase(path: string): BetterSqlite3.Database {
  const db = new BetterSqlite3(path);
  configureConnection(db);

  const vecLoaded = tryLoadVecExtension(db);
  if (vecLoaded) ensureEmbeddingsVecTable(db);

  if (isFreshDatabase(db)) {
    initializeFreshDatabase(db);
    return db;
  }

  applyManualMigrations(db, path);
  applyDrizzleMigrations(db, vecLoaded);
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
    const envPath = process.env['SQLITE_PATH'];
    if (!envPath) {
      const fallback = './data/pops.db';
      if (!existsSync(fallback)) {
        throw new Error(
          `[db] SQLITE_PATH is not set and fallback path '${fallback}' does not exist. ` +
            `Copy apps/pops-api/.env.example to .env and set SQLITE_PATH to an absolute path.`
        );
      }
      console.warn(`[db] SQLITE_PATH not set — using fallback: ${fallback}`);
      prodDb = openDatabase(fallback);
    } else {
      prodDb = openDatabase(envPath);
    }
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
