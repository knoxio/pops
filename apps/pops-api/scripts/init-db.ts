import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Initialize empty database for local development
 * Run with: tsx scripts/init-db.ts
 */
import BetterSqlite3 from 'better-sqlite3';

import { initializeSchema } from '../src/db/schema.js';
import { assertNotProduction, assertLowRecordCount } from './lib/guard.js';

assertNotProduction();

const DB_PATH = process.env.SQLITE_PATH ?? './data/pops.db';

// Create data directory if it doesn't exist
mkdirSync(dirname(DB_PATH), { recursive: true });

// Delete existing database — init always creates a fresh database.
// Use migrations (runMigrations in db.ts) to upgrade existing databases.
if (existsSync(DB_PATH)) {
  const existing = new BetterSqlite3(DB_PATH);
  assertLowRecordCount(existing);
  existing.close();
  unlinkSync(DB_PATH);
  // Also remove WAL/SHM files if present
  if (existsSync(`${DB_PATH}-wal`)) unlinkSync(`${DB_PATH}-wal`);
  if (existsSync(`${DB_PATH}-shm`)) unlinkSync(`${DB_PATH}-shm`);
  console.log(`🗑️  Removed existing database at ${DB_PATH}`);
}

const db = new BetterSqlite3(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

initializeSchema(db);

console.log(`✅ Database initialized at ${DB_PATH}`);
console.log("📝 Note: Database is empty. Run 'mise db:seed' to populate with test data.");

db.close();
