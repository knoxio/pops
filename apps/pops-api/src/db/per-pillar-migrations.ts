/**
 * Per-pillar migration runner (pillar-migration P1).
 *
 * Walks {@link KNOWN_PILLARS}, looks for each pillar's drizzle journal at
 * `<repoRoot>/<pillarDbPackageDir>/migrations/_journal.json`, and applies
 * any entries not yet in `__drizzle_migrations`. The shared
 * `apps/pops-api/src/db/drizzle-migrations/` journal stays the source of
 * truth for everything that hasn't moved into a pillar `-db` package yet —
 * the per-pillar runner runs *after* the shared runner and only sees the
 * pillars that already own their journal.
 *
 * Boot-time contract (ADR-026 + roadmap P1):
 *   1. `applyDrizzleMigrations` (in `db.ts`) runs the shared journal via
 *      `runPerModuleMigrationsByOwner` — the install-set filter is still
 *      driven by `migration-ownership.ts`.
 *   2. `runPerPillarMigrations` (this file) runs every pillar's own
 *      journal. No ownership filter — a pillar that owns a journal owns
 *      every entry in it. The install-set filter at this level lives one
 *      step up: when a pillar's `<id>-db` package isn't installed in this
 *      build, its journal file isn't on disk and the runner skips it.
 *
 * Migration-ownership map (`migration-ownership.ts`) is **transitional**.
 * It retires when every tag in the shared journal has been moved into the
 * appropriate pillar's `-db/migrations/`. Each pillar's Phase 1 split
 * drops the tags it owns from the map; the file is deleted in the final
 * pillar's deletion PR.
 *
 * @see .claude/pillar-migration-roadmap.md (P1)
 */
import { join, resolve } from 'node:path';

import { classifyOrApply, prepareApplyCaches, type ApplyBucket } from './migration-apply.js';
import { readJournalFrom } from './per-module-migrations.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { PillarDescriptor } from './known-pillars.js';

/**
 * Apply-bucket counters per pillar, plus a top-level `pillars` field that
 * records which pillars had a journal on disk (vs. which were skipped
 * because no `<id>-db` package exists yet). The shape matches
 * `PerModuleMigrationResult` for the buckets that exist at this layer
 * (no ownership classification, so no `skipped`/`unowned` buckets).
 */
export interface PerPillarMigrationResult {
  /** Tags applied this run, in pillar-then-journal order. */
  applied: readonly string[];
  /** Tags whose hash was newly inserted but some statements were no-ops. */
  backfilled: readonly string[];
  /** Tags whose hash is already recorded — no action taken. */
  alreadyApplied: readonly string[];
  /** Pillar ids whose journal was discovered and walked. */
  pillarsApplied: readonly string[];
  /** Pillar ids whose `<id>-db` package isn't on disk yet — skipped. */
  pillarsSkipped: readonly string[];
}

interface RunOptions {
  /**
   * Override the repo root used to resolve `<pillarDbPackageDir>`. Tests
   * inject a tmp dir so the runner walks a stub journal instead of the
   * real workspace tree. Defaults to the actual monorepo root resolved
   * from this module's location.
   */
  repoRoot?: string;
}

/**
 * Resolve the monorepo root from this module's location. This file lives
 * at `apps/pops-api/src/db/per-pillar-migrations.ts` — four directory
 * levels up is the repo root. Kept here (not in a shared helper) because
 * it's the only file that needs the repo-relative pillar dir path.
 */
function defaultRepoRoot(): string {
  return resolve(import.meta.dirname, '..', '..', '..', '..');
}

function pillarMigrationsDir(pillar: PillarDescriptor, repoRoot: string): string {
  return join(repoRoot, pillar.dbPackageDir, 'migrations');
}

/**
 * Apply every known pillar's journal. Returns a typed breakdown so tests
 * (and ops tooling) can assert the discovery + application happened.
 *
 * Idempotent: re-runs against the same database short-circuit on the
 * `__drizzle_migrations` hash check.
 */
export function runPerPillarMigrations(
  db: BetterSqlite3.Database,
  pillars: readonly PillarDescriptor[],
  options: RunOptions = {}
): PerPillarMigrationResult {
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const buckets: Record<ApplyBucket, string[]> = {
    applied: [],
    backfilled: [],
    alreadyApplied: [],
  };
  const pillarsApplied: string[] = [];
  const pillarsSkipped: string[] = [];

  // Prepare caches lazily — the common case in P1 is "no pillar has a
  // journal yet" and we'd rather not touch the tracking tables when the
  // runner has nothing to do.
  let caches: ReturnType<typeof prepareApplyCaches> | null = null;

  for (const pillar of pillars) {
    const dir = pillarMigrationsDir(pillar, repoRoot);
    const journal = readJournalFrom(dir);
    if (journal.entries.length === 0) {
      pillarsSkipped.push(pillar.id);
      continue;
    }
    pillarsApplied.push(pillar.id);
    caches ??= prepareApplyCaches(db);
    for (const entry of journal.entries) {
      const bucket = classifyOrApply(db, entry.tag, caches, dir);
      buckets[bucket].push(entry.tag);
    }
  }

  return {
    applied: buckets.applied,
    backfilled: buckets.backfilled,
    alreadyApplied: buckets.alreadyApplied,
    pillarsApplied,
    pillarsSkipped,
  };
}
