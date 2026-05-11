/**
 * Per-module migration runner (PRD-101 US-09, #2543).
 *
 * Drizzle's flat journal lives in `drizzle-migrations/meta/_journal.json` —
 * before PRD-101 every entry in that journal ran unconditionally on boot
 * regardless of which modules were installed. After PRD-101 each module
 * declares the migration tags it owns via `manifest.backend.migrations`;
 * the runner reads `installedManifests()`, builds the union of allowed
 * tags, and skips entries owned by absent modules.
 *
 * Backward compatibility: the runner records applied migrations under the
 * same `__drizzle_migrations` hash convention `drizzle-orm/migrator` uses,
 * so a database upgraded from the pre-PRD-101 runtime continues to work
 * untouched — every entry already in `__drizzle_migrations` is treated as
 * applied and no re-application is attempted.
 *
 * Skipped (absent-module) migrations are NOT recorded — re-enabling the
 * module on a subsequent boot brings them in naturally.
 *
 * Orphan warning: if `__drizzle_migrations` contains hashes for tags
 * whose owning module is now absent, the runner logs a warning naming each
 * orphan tag so operators can spot leftover data from previously-installed
 * modules. Orphan migrations are NEVER deleted — data is intact.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../lib/logger.js';
import { DRIZZLE_MIGRATIONS_DIRECTORY } from './migrations-runner.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { ModuleManifest } from '@pops/types';

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

/**
 * Read the drizzle journal. Returns an empty entry list if the file is
 * missing, so the runner is safe on a brand-new repo with no drizzle
 * artefacts yet.
 */
export function readJournal(): Journal {
  try {
    const journalPath = join(DRIZZLE_MIGRATIONS_DIRECTORY, 'meta', '_journal.json');
    return JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: '7', dialect: 'sqlite', entries: [] };
    }
    throw err;
  }
}

/**
 * Build the union of migration ids declared by every installed module's
 * `manifest.backend.migrations` plus core's. Returns a Set for O(1)
 * membership lookup.
 */
export function installedMigrationTags(manifests: readonly ModuleManifest[]): ReadonlySet<string> {
  const tags = new Set<string>();
  for (const m of manifests) {
    for (const migration of m.backend?.migrations ?? []) {
      tags.add(migration.id);
    }
  }
  return tags;
}

/**
 * Build the inverse mapping: migration tag → owning module id. Used to
 * warn about orphan migrations (recorded in `__drizzle_migrations` but
 * owned by a module that isn't installed) and to distinguish "skipped"
 * tags (known but absent module) from "unowned" tags (no module claims
 * the tag at all).
 *
 * Multiple modules MUST NOT own the same migration tag — the build-time
 * registry catches duplicates as a contract violation. If a tag appears
 * in multiple manifests the last write wins and the contract guard fires.
 */
export function migrationOwnershipMap(
  manifests: readonly ModuleManifest[]
): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const m of manifests) {
    for (const migration of m.backend?.migrations ?? []) {
      owners.set(migration.id, m.id);
    }
  }
  return owners;
}

function ensureDrizzleTable(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
}

function appliedHashes(db: BetterSqlite3.Database): Set<string> {
  const rows = db.prepare('SELECT hash FROM __drizzle_migrations').all() as {
    hash: string;
  }[];
  return new Set(rows.map((r) => r.hash));
}

function readMigrationSql(tag: string): string {
  return readFileSync(join(DRIZZLE_MIGRATIONS_DIRECTORY, `${tag}.sql`), 'utf8');
}

/**
 * Drizzle's hashing function. `drizzle-orm/migrator` records each applied
 * migration as `sha256(sql)`. We reproduce the same hash here so a DB
 * upgraded from the pre-PRD-101 runtime keeps working unchanged.
 */
function hashSql(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Result returned by {@link runPerModuleMigrations}. Distinguishes applied,
 * skipped (owned by an absent module), and orphan (already-applied but
 * owner not installed) tags so callers (tests, observability) can assert
 * the filter worked.
 */
export interface PerModuleMigrationResult {
  /** Tags applied during this run (newly inserted into __drizzle_migrations). */
  applied: readonly string[];
  /** Tags skipped because no installed module owns them. */
  skipped: readonly string[];
  /** Tags whose owner is unknown — there's no manifest claiming them. */
  unowned: readonly string[];
  /** Tags whose hash is already recorded — no action taken. */
  alreadyApplied: readonly string[];
}

/**
 * Statement-breakpoint splitter — drizzle splits multi-statement SQL files
 * with the marker `--> statement-breakpoint` and runs each chunk separately.
 * We mirror the same convention so files generated by `drizzle-kit` work
 * identically through this runner.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Apply the drizzle migration set, filtered by the install set.
 *
 * - Entries already in `__drizzle_migrations` (by SHA-256 hash) are
 *   left untouched.
 * - Entries whose owning module is not installed are skipped — nothing
 *   is recorded so they re-run on a future boot when the module appears.
 * - Entries with no declared owner are also skipped and reported via
 *   the `unowned` field on the result, so the contract guard (US-11)
 *   can flag missing ownership declarations.
 *
 * The `knownOwners` argument is the canonical owner map covering every
 * buildable module (whether installed or not). It is used to distinguish
 * "skipped" tags (owned by a known but absent module) from "unowned"
 * tags (no manifest claims the tag at all). When omitted, ownership is
 * derived from the installed manifests only — meaning every tag owned
 * by an absent module is treated as `unowned`.
 *
 * Returns a typed breakdown of what happened. Callers may inspect
 * `applied` / `skipped` / `unowned` / `alreadyApplied` to assert
 * behaviour from tests.
 */
export function runPerModuleMigrations(
  db: BetterSqlite3.Database,
  manifests: readonly ModuleManifest[],
  knownOwners?: ReadonlyMap<string, string>
): PerModuleMigrationResult {
  ensureDrizzleTable(db);

  const journal = readJournal();
  const owners = knownOwners ?? migrationOwnershipMap(manifests);
  const installedTags = installedMigrationTags(manifests);
  const installedIds = new Set(manifests.map((m) => m.id));

  const applied: string[] = [];
  const skipped: string[] = [];
  const unowned: string[] = [];
  const alreadyApplied: string[] = [];

  const knownHashes = appliedHashes(db);
  const insert = db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)');

  for (const entry of journal.entries) {
    const sql = readMigrationSql(entry.tag);
    const hash = hashSql(sql);

    if (knownHashes.has(hash)) {
      alreadyApplied.push(entry.tag);
      continue;
    }

    const owner = owners.get(entry.tag);
    if (owner === undefined) {
      // No declared owner — treat as absent and warn. This is a contract
      // violation; CI (US-11) should catch it, but we don't want a missing
      // ownership entry to silently apply migrations to a partial install.
      unowned.push(entry.tag);
      continue;
    }
    if (!installedIds.has(owner)) {
      skipped.push(entry.tag);
      continue;
    }
    if (!installedTags.has(entry.tag)) {
      // Owner is installed but manifest doesn't list the tag — possible
      // if the ownership map and manifest disagree. Skip defensively.
      skipped.push(entry.tag);
      continue;
    }

    db.transaction(() => {
      for (const stmt of splitStatements(sql)) {
        db.exec(stmt);
      }
      insert.run(hash, Date.now());
    })();
    applied.push(entry.tag);
  }

  return { applied, skipped, unowned, alreadyApplied };
}

/**
 * Inspect `__drizzle_migrations` and warn for any recorded migration whose
 * owning module is not currently installed. The data is intact — just
 * inaccessible because the module is not loaded — so this is an operator
 * info signal, not an error.
 *
 * Returns the list of orphan tags so tests can assert the warning surface
 * without coupling to log internals.
 */
export function warnOrphanMigrations(
  db: BetterSqlite3.Database,
  manifests: readonly ModuleManifest[],
  knownOwners?: ReadonlyMap<string, string>
): readonly string[] {
  return warnOrphanMigrationsByOwner(
    db,
    new Set(manifests.map((m) => m.id)),
    knownOwners ?? migrationOwnershipMap(manifests)
  );
}

/**
 * Variant used at boot (`db.ts`) where the full module manifest graph
 * cannot be imported without creating a circular dependency (manifests
 * transitively import `db.ts` via their tRPC routers).
 *
 * Accepts the install-set of module ids directly plus the canonical
 * ownership map from `migration-ownership.ts`. Behaviour is identical
 * to {@link warnOrphanMigrations}.
 */
export function warnOrphanMigrationsByOwner(
  db: BetterSqlite3.Database,
  installedIds: ReadonlySet<string>,
  owners: ReadonlyMap<string, string>
): readonly string[] {
  ensureDrizzleTable(db);

  const journal = readJournal();
  const recorded = appliedHashes(db);

  const orphans: string[] = [];
  for (const entry of journal.entries) {
    const sql = readMigrationSql(entry.tag);
    if (!recorded.has(hashSql(sql))) continue;
    const owner = owners.get(entry.tag);
    if (owner === undefined) continue;
    if (!installedIds.has(owner)) orphans.push(entry.tag);
  }

  if (orphans.length > 0) {
    logger.warn(
      { orphanMigrations: orphans },
      `[db] ${orphans.length} applied migration(s) belong to modules not in the install set — data preserved but inaccessible until the module is re-enabled.`
    );
  }
  return orphans;
}
