import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import type { SettingsDb } from '../schema.js';

/** A value a {@link makeRejectingDb} database refuses to store. */
export const POISON_VALUE = '__db_reject__';

/**
 * Opens a real in-memory SQLite database with the `settings` table and
 * returns a drizzle handle. Tests run against the actual storage engine —
 * no mocks of things that can be real.
 */
export function makeTestDb(): SettingsDb {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  return drizzle(sqlite);
}

/**
 * Like {@link makeTestDb} but with a CHECK constraint that rejects
 * {@link POISON_VALUE}. Lets a transactional-write test trigger a genuine
 * runtime failure on a mid-batch row using a well-typed (`string`) value,
 * so rollback is exercised without any type-system escape hatch.
 */
export function makeRejectingDb(): SettingsDb {
  const sqlite = new Database(':memory:');
  sqlite.exec(
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK (value <> '${POISON_VALUE}'));`
  );
  return drizzle(sqlite);
}
