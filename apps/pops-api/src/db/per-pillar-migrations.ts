/**
 * Per-pillar migration runner (pillar-migration P1).
 *
 * Walks {@link KNOWN_PILLARS}, looks for each pillar's drizzle journal at
 * `<pillarMigrationsDir>/meta/_journal.json`, and applies any entries not
 * yet in `__drizzle_migrations`. The shared
 * `apps/pops-api/src/db/drizzle-migrations/` journal stays the source of
 * truth for everything that hasn't moved into a pillar `-db` package yet —
 * the per-pillar runner runs *after* the shared runner and only sees the
 * pillars that already own their journal.
 *
 * Pillar migration dir discovery (in order):
 *   1. `resolveInstalledPackage(pillarId)` — by default attempts
 *      `require.resolve('@pops/<id>-db/package.json')` and joins
 *      `migrations/` next to it. Works in dev (pnpm workspace symlink) AND
 *      in production Docker images (the `<id>-db` package ships under
 *      `node_modules/`). Tests inject a custom resolver.
 *   2. Workspace fallback: `<repoRoot>/<pillar.dbPackageDir>/migrations`.
 *      Catches pillars whose `-db` package exists in source but isn't yet
 *      a runtime dep of `@pops/api`.
 *
 * Boot-time contract (ADR-026 + roadmap P1):
 *   1. `applyDrizzleMigrations` (in `db.ts`) runs the shared journal via
 *      `runPerModuleMigrationsByOwner` — the install-set filter is still
 *      driven by `migration-ownership.ts`.
 *   2. `runPerPillarMigrations` (this file) runs every pillar's own
 *      journal. No ownership filter — a pillar that owns a journal owns
 *      every entry in it. The install-set filter at this level lives one
 *      step up: when a pillar's `<id>-db` package isn't installed in this
 *      build, no journal is on disk and the runner skips it.
 *
 * Migration-ownership map (`migration-ownership.ts`) is **transitional**.
 * It retires when every tag in the shared journal has been moved into the
 * appropriate pillar's `-db/migrations/`. Each pillar's Phase 1 split
 * drops the tags it owns from the map; the file is deleted in the final
 * pillar's deletion PR.
 *
 * @see .claude/pillar-migration-roadmap.md (P1)
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { classifyOrApply, prepareApplyCaches, type ApplyBucket } from './migration-apply.js';
import { readJournalFrom } from './per-module-migrations.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { PillarDescriptor } from './known-pillars.js';

/**
 * Result returned by {@link runPerPillarMigrations}. Per-tag buckets match
 * `PerModuleMigrationResult` for the buckets that exist at this layer (no
 * ownership classification, so no `skipped`/`unowned`). `pillarsApplied`
 * and `pillarsSkipped` partition the input pillar list — every pillar
 * lands in exactly one of them.
 */
export interface PerPillarMigrationResult {
  /** Tags applied this run, in pillar-then-journal order. */
  applied: readonly string[];
  /** Tags whose hash was newly inserted but some statements were no-ops. */
  backfilled: readonly string[];
  /** Tags whose hash is already recorded — no action taken. */
  alreadyApplied: readonly string[];
  /** Pillar ids whose journal was discovered and had at least one entry. */
  pillarsApplied: readonly string[];
  /**
   * Pillar ids skipped this run. A pillar is skipped when its `-db`
   * package isn't installed (or its workspace dir doesn't exist yet) OR
   * when its journal exists on disk but has zero entries.
   */
  pillarsSkipped: readonly string[];
}

interface RunOptions {
  /**
   * Override the repo root used to resolve `<pillarDbPackageDir>` for the
   * workspace fallback path. Tests inject a tmp dir so the runner walks a
   * stub journal instead of the real workspace tree. Defaults to the
   * actual monorepo root resolved from this module's location.
   */
  repoRoot?: string;
  /**
   * Override the installed-package resolver. The default uses
   * `createRequire(import.meta.url).resolve('@pops/<id>-db/package.json')`,
   * which resolves both the workspace symlink in dev and the bundled copy
   * in a Docker image. Returns the absolute path to the package's root
   * (the directory containing `package.json`), or null when the package
   * isn't installed. Tests inject `() => null` to force the workspace
   * fallback path.
   */
  resolveInstalledPackage?: (pillarId: string) => string | null;
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

/**
 * Default installed-package resolver. Tries `require.resolve` against the
 * `@pops/<id>-db/package.json` entry point and returns its directory; on
 * MODULE_NOT_FOUND (and only on that error class — anything else
 * bubbles), returns null so the runner falls back to the workspace path.
 */
function defaultResolveInstalledPackage(pillarId: string): string | null {
  const req = createRequire(import.meta.url);
  try {
    return dirname(req.resolve(`@pops/${pillarId}-db/package.json`));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

function pillarMigrationsDir(
  pillar: PillarDescriptor,
  repoRoot: string,
  resolveInstalled: (pillarId: string) => string | null
): string {
  const installedRoot = resolveInstalled(pillar.id);
  if (installedRoot !== null) return join(installedRoot, 'migrations');
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
  const resolveInstalled = options.resolveInstalledPackage ?? defaultResolveInstalledPackage;
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
    const dir = pillarMigrationsDir(pillar, repoRoot, resolveInstalled);
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
