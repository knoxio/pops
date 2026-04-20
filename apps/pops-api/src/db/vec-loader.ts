import * as sqliteVec from 'sqlite-vec';

import { logger } from '../lib/logger.js';

import type BetterSqlite3 from 'better-sqlite3';

let vecAvailable = false;

export function isVecAvailable(): boolean {
  return vecAvailable;
}

/**
 * Load the sqlite-vec extension into a database connection.
 * Sets the module-level `vecAvailable` flag on first successful load.
 * Safe to call on multiple connections — the extension binary is loaded once per process.
 */
export function tryLoadVecExtension(db: BetterSqlite3.Database): boolean {
  try {
    sqliteVec.load(db);
    if (!vecAvailable) {
      const version = db.prepare('SELECT vec_version()').pluck().get() as string;
      logger.info({ version }, '[db] sqlite-vec loaded');
      vecAvailable = true;
    }
    return true;
  } catch (err) {
    if (!vecAvailable) {
      logger.error(
        { err: (err as Error).message },
        '[db] sqlite-vec extension failed to load — vector features disabled'
      );
    }
    return false;
  }
}
