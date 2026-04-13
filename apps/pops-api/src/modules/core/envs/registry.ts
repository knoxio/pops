/**
 * Environment registry — manages named SQLite environments.
 *
 * Each environment is an isolated SQLite database with its own data.
 * The registry table lives in the prod DB; env DBs live under ./data/envs/.
 */
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import { getDb, openEnvDatabase } from '../../../db.js';
import { seedDatabase } from '../../../db/seeder.js';

export interface EnvRecord {
  name: string;
  db_path: string;
  seed_type: 'none' | 'test';
  ttl_seconds: number | null;
  created_at: string;
  expires_at: string | null;
}

/** Computed TTL remaining in seconds, or null for infinite. */
export interface EnvStatus extends EnvRecord {
  ttl_remaining: number | null;
}

/**
 * In-memory cache of open env DB connections keyed by env name.
 *
 * Bounds: envs are scoped to testing workflows and are expected to be short-lived.
 * The TTL watcher purges expired envs every 30 s; startupCleanup() removes any
 * stragglers on restart. In normal usage (CI + local dev) the number of live envs
 * at any point is O(1). If unbounded growth becomes a concern, add TTLs to all
 * envs or call closeEnvDb() explicitly when done.
 */
const connections = new Map<string, BetterSqlite3.Database>();

/** Env DB files live next to the prod DB under ./envs/ subdirectory. */
function envDbPath(name: string): string {
  const sqlitePath = process.env['SQLITE_PATH'] ?? './data/pops.db';
  return join(dirname(sqlitePath), 'envs', `${name}.db`);
}

/** Validate env name: alphanumeric + hyphens, 1–64 chars, not "prod". */
export function validateEnvName(name: string): string | null {
  if (name === 'prod') return `"prod" is reserved`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(name))
    return 'Name must start and end with alphanumeric characters, hyphens allowed in between';
  if (name.length < 1 || name.length > 64) return 'Name must be 1–64 characters';
  return null;
}

/** Get a single env record from the prod DB. Returns null if not found. */
export function getEnvRecord(name: string): EnvRecord | null {
  const row = getDb().prepare('SELECT * FROM environments WHERE name = ?').get(name) as
    | EnvRecord
    | undefined;
  return row ?? null;
}

/** List all env records. */
export function listEnvs(): EnvRecord[] {
  return getDb()
    .prepare('SELECT * FROM environments ORDER BY created_at DESC')
    .all() as EnvRecord[];
}

/**
 * Get or open a DB connection for the given env record.
 * Caches connections in memory; reopens if the process restarted.
 *
 * No race condition risk: better-sqlite3 is synchronous and Node.js is
 * single-threaded, so two calls with the same name execute sequentially —
 * the second always hits the cache set by the first.
 */
export function getOrOpenEnvDb(record: EnvRecord): BetterSqlite3.Database {
  const cached = connections.get(record.name);
  if (cached) return cached;

  const db = openEnvDatabase(record.db_path);
  connections.set(record.name, db);
  return db;
}

/** Close and remove a connection from the cache (does not delete the file). */
export function closeEnvDb(name: string): void {
  const db = connections.get(name);
  if (db) {
    db.close();
    connections.delete(name);
  }
}

/**
 * Create a new named environment.
 * Returns the created record, or throws if the name already exists.
 */
export function createEnv(
  name: string,
  seedType: 'none' | 'test',
  ttlSeconds: number | null
): EnvRecord {
  const dbPath = envDbPath(name);

  // Ensure envs directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  // Open the env DB (runs migrations, creates schema)
  const db = openEnvDatabase(dbPath);
  connections.set(name, db);

  // Optionally seed
  if (seedType === 'test') {
    seedDatabase(db);
  }

  // Compute expires_at
  const expiresAt =
    ttlSeconds !== null ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;

  // Insert into prod DB registry — clean up the file and cached connection on failure
  try {
    getDb()
      .prepare(
        `INSERT INTO environments (name, db_path, seed_type, ttl_seconds, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, dbPath, seedType, ttlSeconds, expiresAt);
  } catch (err) {
    db.close();
    connections.delete(name);
    try {
      unlinkSync(dbPath);
    } catch {
      /* already gone */
    }
    throw err;
  }

  return getEnvRecord(name) as EnvRecord;
}

/**
 * Update the TTL for an existing environment.
 * ttlSeconds=null means infinite (clears expires_at).
 */
export function updateEnvTtl(name: string, ttlSeconds: number | null): EnvRecord | null {
  const record = getEnvRecord(name);
  if (!record) return null;

  const expiresAt =
    ttlSeconds !== null ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;

  getDb()
    .prepare(`UPDATE environments SET ttl_seconds = ?, expires_at = ? WHERE name = ?`)
    .run(ttlSeconds, expiresAt, name);

  return getEnvRecord(name);
}

/**
 * Delete an environment: close DB, delete file, remove registry row.
 * Returns true if deleted, false if not found.
 */
export function deleteEnv(name: string): boolean {
  const record = getEnvRecord(name);
  if (!record) return false;

  closeEnvDb(name);

  try {
    unlinkSync(record.db_path);
  } catch {
    // File may already be gone — not an error
  }

  getDb().prepare('DELETE FROM environments WHERE name = ?').run(name);
  return true;
}

/** Delete all environments whose expires_at is in the past. */
export function deleteExpiredEnvs(): string[] {
  const expired = getDb()
    .prepare(
      `SELECT * FROM environments WHERE expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')`
    )
    .all() as EnvRecord[];

  const deleted: string[] = [];
  for (const record of expired) {
    closeEnvDb(record.name);
    try {
      unlinkSync(record.db_path);
    } catch {
      // Already gone
    }
    getDb().prepare('DELETE FROM environments WHERE name = ?').run(record.name);
    deleted.push(record.name);
  }

  return deleted;
}

/** Compute seconds remaining on TTL. null = infinite. */
export function ttlRemaining(record: EnvRecord): number | null {
  if (!record.expires_at) return null;
  const remaining = Math.max(0, (new Date(record.expires_at).getTime() - Date.now()) / 1000);
  return Math.round(remaining);
}

/**
 * Startup cleanup — run once when the server starts.
 *
 * Handles two crash-survivor scenarios:
 *  1. Expired envs whose TTL passed while the server was down (TTL watcher
 *     couldn't fire because the process wasn't running).
 *  2. Orphaned DB files in envs/ that have no matching registry row (left
 *     behind when the server crashed mid-createEnv before the INSERT).
 *
 * Returns a summary of what was cleaned up for logging.
 */
export function startupCleanup(): { expired: string[]; orphaned: string[] } {
  const expired = deleteExpiredEnvs();

  // Scan the envs/ directory for .db files with no registry entry
  const envsDir = join(dirname(process.env['SQLITE_PATH'] ?? './data/pops.db'), 'envs');
  const orphaned: string[] = [];

  let files: string[];
  try {
    files = readdirSync(envsDir).filter((f) => f.endsWith('.db'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { expired, orphaned };
    throw err;
  }

  const registeredPaths = new Set(listEnvs().map((e) => e.db_path));
  for (const file of files) {
    const filePath = join(envsDir, file);
    if (!registeredPaths.has(filePath)) {
      try {
        unlinkSync(filePath);
        orphaned.push(basename(file, '.db'));
      } catch {
        // Already gone — not an error
      }
    }
  }

  return { expired, orphaned };
}
