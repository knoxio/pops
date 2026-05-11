/**
 * Single-entry apply path for the per-module migration runner.
 *
 * Split out of `per-module-migrations.ts` to keep that file under the
 * per-file line cap. The responsibilities here are:
 *
 *   1. Read the SQL file for one tag.
 *   2. Classify against the in-memory caches (drift detection, already-
 *      applied short-circuit, backfill from legacy hash-only tracking).
 *   3. When applying, run every statement inside a transaction with the
 *      additive-DDL "already applied" recovery from `migration-backfill.ts`,
 *      then record both `__drizzle_migrations` and `__pops_migration_tags`
 *      rows atomically.
 *
 * The runner stays at the top level: ownership classification, journal
 * iteration, and result-bucket aggregation.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../lib/logger.js';
import { isAlreadyAppliedError, splitStatements } from './migration-backfill.js';
import { DRIZZLE_MIGRATIONS_DIRECTORY } from './migrations-runner.js';

import type BetterSqlite3 from 'better-sqlite3';

export type ApplyBucket = 'applied' | 'backfilled' | 'alreadyApplied';

export interface ApplyCaches {
  knownHashes: Set<string>;
  knownTags: Map<string, string>;
  insertDrizzle: BetterSqlite3.Statement;
  insertTag: BetterSqlite3.Statement;
}

function readMigrationSql(tag: string): string {
  return readFileSync(join(DRIZZLE_MIGRATIONS_DIRECTORY, `${tag}.sql`), 'utf8');
}

/**
 * Drizzle's hashing function. `drizzle-orm/migrator` records each applied
 * migration as `sha256(sql)`. We reproduce the same hash here so a DB
 * upgraded from the pre-PRD-101 runtime keeps working unchanged.
 */
export function hashSql(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

interface ApplyMigrationArgs {
  db: BetterSqlite3.Database;
  tag: string;
  sql: string;
  hash: string;
  insertDrizzle: BetterSqlite3.Statement;
  insertTag: BetterSqlite3.Statement;
}

/**
 * Apply one migration's SQL inside a transaction. Per-statement errors
 * matching the "already applied" patterns are caught and logged; any
 * other error aborts the transaction.
 */
function applyMigration({
  db,
  tag,
  sql,
  hash,
  insertDrizzle,
  insertTag,
}: ApplyMigrationArgs): 'applied' | 'backfilled' {
  let didBackfill = false;
  db.transaction(() => {
    for (const stmt of splitStatements(sql)) {
      try {
        db.exec(stmt);
      } catch (err) {
        if (!isAlreadyAppliedError(err)) throw err;
        didBackfill = true;
        logger.info(
          {
            migrationTag: tag,
            statementPreview: stmt.slice(0, 80),
            sqliteError: (err as Error).message,
          },
          `[db] Migration "${tag}" statement already applied to schema — recording hash without re-running.`
        );
      }
    }
    const appliedAt = Date.now();
    insertDrizzle.run(hash, appliedAt);
    insertTag.run(tag, hash, appliedAt);
  })();
  return didBackfill ? 'backfilled' : 'applied';
}

/**
 * Decide whether the entry is already on file (and how) or needs to be
 * applied. Mutates `caches` to keep hash/tag tracking consistent within
 * one boot when multiple journal entries share the same SQL body.
 */
export function classifyOrApply(
  db: BetterSqlite3.Database,
  tag: string,
  caches: ApplyCaches
): ApplyBucket {
  const sql = readMigrationSql(tag);
  const hash = hashSql(sql);

  // Tag-based dedupe wins over hash-based dedupe (issue #2610).
  const recordedHash = caches.knownTags.get(tag);
  if (recordedHash !== undefined) {
    if (recordedHash !== hash) {
      logger.warn(
        { migrationTag: tag, recordedHash, currentHash: hash },
        `[db] Migration "${tag}" hash drift — file edited after apply, skipping re-run.`
      );
    }
    return 'alreadyApplied';
  }

  if (caches.knownHashes.has(hash)) {
    // Applied under the old hash-only tracking. Backfill the tag row so
    // future drift gets caught.
    caches.insertTag.run(tag, hash, Date.now());
    caches.knownTags.set(tag, hash);
    return 'alreadyApplied';
  }

  const outcome = applyMigration({
    db,
    tag,
    sql,
    hash,
    insertDrizzle: caches.insertDrizzle,
    insertTag: caches.insertTag,
  });
  caches.knownHashes.add(hash);
  caches.knownTags.set(tag, hash);
  return outcome;
}
