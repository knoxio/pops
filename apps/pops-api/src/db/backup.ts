import { logger } from '../lib/logger.js';

import type BetterSqlite3 from 'better-sqlite3';

function hasData(database: BetterSqlite3.Database): boolean {
  try {
    const row = database.prepare('SELECT COUNT(*) AS cnt FROM transactions').get() as
      | { cnt: number }
      | undefined;
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Create a pre-migration backup using VACUUM INTO.
 * Returns the backup path or null if backup was skipped.
 */
export function createPreMigrationBackup(
  database: BetterSqlite3.Database,
  dbPath: string,
  pendingCount: number
): string | null {
  if (!hasData(database)) return null;

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const backupPath = `${dbPath}.pre-migration-${timestamp}.bak`;

  logger.info({ pendingCount }, '[db] Backing up database before applying migrations');
  database.exec(`VACUUM INTO '${backupPath.replaceAll(/'/g, "''")}'`);
  return backupPath;
}

export function isFreshDatabase(database: BetterSqlite3.Database): boolean {
  const row = database
    .prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .get() as { cnt: number };
  return row.cnt === 0;
}
