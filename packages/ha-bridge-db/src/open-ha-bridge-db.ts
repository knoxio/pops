/**
 * Standalone opener for the HA bridge pillar's SQLite database.
 *
 * Mirrors the per-pillar opener pattern used by `@pops/finance-db`,
 * `@pops/lists-db`, `@pops/media-db`, etc. — open the file, set the
 * standard pragmas, apply the in-package drizzle migrations journal,
 * and return both the typed handle and the raw better-sqlite3 connection
 * so the caller can close it cleanly on shutdown.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { HaBridgeDb } from './services/internal.js';

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'migrations');
}

export interface OpenedHaBridgeDb {
  db: HaBridgeDb;
  raw: Database.Database;
}

/**
 * Open the HA bridge SQLite at `path`, configure WAL + busy-timeout +
 * foreign-keys, run the migrations journal, and return both handles.
 *
 * The caller owns lifecycle — on shutdown, call `raw.close()`.
 */
export function openHaBridgeDb(path: string): OpenedHaBridgeDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as HaBridgeDb;
  try {
    migrate(db, { migrationsFolder: migrationsDir() });
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
