import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../lib/logger.js';

import type BetterSqlite3 from 'better-sqlite3';

const __dirname = import.meta.dirname;
const MIGRATIONS_DIR = join(__dirname, 'migrations');
const DRIZZLE_MIGRATIONS_DIR = join(__dirname, 'drizzle-migrations');

export const MIGRATIONS_DIRECTORY = MIGRATIONS_DIR;
export const DRIZZLE_MIGRATIONS_DIRECTORY = DRIZZLE_MIGRATIONS_DIR;

function ensureMigrationsTable(database: BetterSqlite3.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function listAppliedMigrations(database: BetterSqlite3.Database): Set<string> {
  const rows = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
    version: string;
  }[];
  return new Set(rows.map((r) => r.version));
}

function listMigrationFiles(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .toSorted();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export function runMigrations(database: BetterSqlite3.Database): void {
  ensureMigrationsTable(database);
  const applied = listAppliedMigrations(database);
  const files = listMigrationFiles();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    })();

    logger.info({ file }, '[db] Applied migration');
  }
}

export function getPendingMigrations(database: BetterSqlite3.Database): string[] {
  ensureMigrationsTable(database);
  const applied = listAppliedMigrations(database);
  const files = listMigrationFiles();
  return files.filter((f) => !applied.has(f));
}

function ensureDrizzleMigrationsTable(database: BetterSqlite3.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
}

export function markDrizzleMigrationsFromJournal(
  database: BetterSqlite3.Database,
  filter?: (entry: { idx: number; tag: string }) => boolean
): void {
  try {
    const journalPath = join(DRIZZLE_MIGRATIONS_DIR, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };

    ensureDrizzleMigrationsTable(database);

    const insert = database.prepare(
      'INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)'
    );

    const entries = filter ? journal.entries.filter(filter) : journal.entries;
    for (const entry of entries) {
      const sqlPath = join(DRIZZLE_MIGRATIONS_DIR, `${entry.tag}.sql`);
      const sql = readFileSync(sqlPath, 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      insert.run(hash, Date.now());
    }
  } catch {
    // Non-fatal — Drizzle migrate will handle it on next startup
  }
}

export function markDrizzleMigrationsApplied(database: BetterSqlite3.Database): void {
  markDrizzleMigrationsFromJournal(database);
}

export function markDrizzleBaselineMigrationsApplied(database: BetterSqlite3.Database): void {
  markDrizzleMigrationsFromJournal(database, (entry) => entry.idx <= 8);
}

export function hasDrizzleMigrationsTable(database: BetterSqlite3.Database): boolean {
  const row = database
    .prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
    )
    .get() as { cnt: number };
  return row.cnt > 0;
}

export function markVecMigrationApplied(database: BetterSqlite3.Database): void {
  try {
    const vecMigrationPath = join(DRIZZLE_MIGRATIONS_DIR, '0033_embeddings_vec.sql');
    const vecSql = readFileSync(vecMigrationPath, 'utf8');
    const hash = createHash('sha256').update(vecSql).digest('hex');
    ensureDrizzleMigrationsTable(database);
    database
      .prepare('INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run(hash, Date.now());
  } catch {
    // Non-fatal — startup proceeds, migration will retry on next start
  }
}
