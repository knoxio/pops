import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeSchema } from "./db/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "db", "migrations");

/** Singleton prod database connection. */
let prodDb: BetterSqlite3.Database | null = null;

/**
 * Per-request database context.
 * When a request targets a named environment (via ?env=NAME), the env middleware
 * sets this store so that getDb() returns the correct environment-scoped DB for
 * all service calls made within that request — without changing any service signatures.
 */
const asyncDb = new AsyncLocalStorage<BetterSqlite3.Database>();

/**
 * Run any pending SQL migrations against the given database.
 * Tracks applied migrations in a `schema_migrations` table (version = filename).
 * Migrations are applied in filename-sorted order, each in its own transaction.
 */
function runMigrations(database: BetterSqlite3.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (
      database.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
        version: string;
      }[]
    ).map((r) => r.version)
  );

  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return; // No migrations directory
    throw err;
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    database.transaction(() => {
      database.exec(sql);
      database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(file);
    })();

    console.log(`[db] Applied migration: ${file}`);
  }
}

/**
 * Check how many migrations are pending (not yet applied).
 * Returns the count and the list of pending filenames.
 */
function getPendingMigrations(database: BetterSqlite3.Database): string[] {
  // Ensure the tracking table exists before querying
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (
      database.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
        version: string;
      }[]
    ).map((r) => r.version)
  );

  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  return files.filter((f) => !applied.has(f));
}

/** Check if the database has any data (not a fresh install). */
function hasData(database: BetterSqlite3.Database): boolean {
  try {
    const row = database.prepare("SELECT COUNT(*) AS cnt FROM transactions").get() as
      | { cnt: number }
      | undefined;
    return (row?.cnt ?? 0) > 0;
  } catch {
    // Table may not exist on fresh install
    return false;
  }
}

/**
 * Create a pre-migration backup using VACUUM INTO.
 * Returns the backup path or null if backup was skipped.
 */
function createPreMigrationBackup(
  database: BetterSqlite3.Database,
  dbPath: string,
  pendingCount: number
): string | null {
  if (!hasData(database)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${dbPath}.pre-migration-${timestamp}.bak`;

  console.log(`[db] Backing up database before applying ${pendingCount} migration(s)...`);
  database.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return backupPath;
}

/** Check if this is a completely fresh database (no tables at all). */
function isFreshDatabase(database: BetterSqlite3.Database): boolean {
  const row = database
    .prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .get() as { cnt: number };
  return row.cnt === 0;
}

/** Open and configure a SQLite database. Runs migrations on first open. */
function openDatabase(path: string): BetterSqlite3.Database {
  const db = new BetterSqlite3(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  // Fresh database: initialize full schema (creates all tables + marks migrations as applied)
  if (isFreshDatabase(db)) {
    console.log("[db] Fresh database detected — initializing schema...");
    initializeSchema(db);
    console.log("[db] Schema initialized successfully.");
    return db;
  }

  const pending = getPendingMigrations(db);

  if (pending.length === 0) {
    return db;
  }

  const backupPath = createPreMigrationBackup(db, path, pending.length);

  try {
    runMigrations(db);
  } catch (err) {
    if (backupPath) {
      console.error(`[db] Migration failed. Backup available at: ${backupPath}`);
    }
    throw err;
  }

  if (backupPath) {
    try {
      unlinkSync(backupPath);
      console.log("[db] All migrations applied successfully. Backup removed.");
    } catch {
      // Non-fatal — backup cleanup failure shouldn't crash startup
    }
  }

  return db;
}

/**
 * Get the database for the current request context.
 *
 * - Inside an `withEnvDb()` scope: returns the environment-scoped DB.
 * - Otherwise: returns the prod singleton.
 *
 * All service files call this — no changes needed when adding env support.
 */
export function getDb(): BetterSqlite3.Database {
  return asyncDb.getStore() ?? getProdDb();
}

/**
 * Returns true when the current async context is a named environment (i.e.
 * the request included ?env=NAME and the env middleware called withEnvDb).
 *
 * Named envs are ephemeral, isolated SQLite databases. Code that would
 * otherwise call external services (Claude API) should skip those calls
 * when this returns true — the operations are meaningless against a
 * fresh test DB.
 */
export function isNamedEnvContext(): boolean {
  return asyncDb.getStore() !== undefined;
}

/** Get or create the prod singleton connection. */
function getProdDb(): BetterSqlite3.Database {
  if (!prodDb) {
    const sqlitePath = process.env["SQLITE_PATH"] ?? "./data/pops.db";
    prodDb = openDatabase(sqlitePath);
  }
  return prodDb;
}

/**
 * Run a callback (and all async continuations it spawns) with a specific
 * database in scope. Used by the env context middleware so that tRPC handlers
 * and services automatically use the correct env DB without changes.
 */
export function withEnvDb<T>(db: BetterSqlite3.Database, fn: () => T): T {
  return asyncDb.run(db, fn);
}

/**
 * Open a new SQLite database at the given path and initialize it with the full schema.
 * Used by the env registry when creating a new environment.
 *
 * Env databases are always fresh files — they need the full schema applied from scratch,
 * not incremental ALTER TABLE migrations (which assume an existing prod DB structure).
 */
export function openEnvDatabase(path: string): BetterSqlite3.Database {
  const db = new BetterSqlite3(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  initializeSchema(db);
  return db;
}

/** Close the prod database connection (for graceful shutdown or test teardown). */
export function closeDb(): void {
  if (prodDb) {
    prodDb.close();
    prodDb = null;
  }
}

/**
 * Replace the prod connection with a custom one (for testing).
 * Returns the previous connection so callers can restore it if needed.
 */
export function setDb(newDb: BetterSqlite3.Database): BetterSqlite3.Database | null {
  const prev = prodDb;
  prodDb = newDb;
  return prev;
}

/**
 * Get a Drizzle ORM instance wrapping the current database connection.
 * Respects the env context (AsyncLocalStorage) — returns a Drizzle instance
 * for the correct database whether in prod or a named environment.
 *
 * Services migrating from raw SQL to Drizzle should call this instead of getDb().
 */
export function getDrizzle(): BetterSQLite3Database {
  return drizzle(getDb());
}

export type { BetterSQLite3Database };
