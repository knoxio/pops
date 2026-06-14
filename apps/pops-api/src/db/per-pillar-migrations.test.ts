/**
 * Per-pillar migration runner tests (P1).
 *
 * Stubs a tmp repoRoot with synthetic pillar `<id>-db/migrations/` dirs and
 * journals, then drives the runner against an in-memory SQLite database.
 * `resolveInstalledPackage` is forced to `null` so the workspace fallback
 * (repoRoot-based) path is exercised — there's a dedicated test for the
 * installed-package branch that injects a stub.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPerPillarMigrations } from './per-pillar-migrations.js';

import type { PillarDescriptor } from './known-pillars.js';

let repoRoot: string;
let dbPath: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'per-pillar-mig-'));
  dbPath = join(repoRoot, 'test.db');
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function pillar(id: string): PillarDescriptor {
  return { id, dbPackageDir: `packages/${id}-db` };
}

/** Default options used by the workspace-fallback tests. */
function workspaceOpts(): {
  repoRoot: string;
  resolveInstalledPackage: () => null;
} {
  return { repoRoot, resolveInstalledPackage: () => null };
}

function writePillarJournal(
  pillarId: string,
  tags: readonly { tag: string; sql: string }[]
): string {
  const dir = join(repoRoot, `packages/${pillarId}-db`, 'migrations');
  mkdirSync(join(dir, 'meta'), { recursive: true });
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: tags.map((t, i) => ({
        idx: i,
        version: '7',
        when: 1_000_000 + i,
        tag: t.tag,
        breakpoints: true,
      })),
    })
  );
  for (const t of tags) {
    writeFileSync(join(dir, `${t.tag}.sql`), t.sql);
  }
  return dir;
}

async function withDb<T>(run: (db: BetterSqlite3.Database) => T | Promise<T>): Promise<T> {
  const db = new BetterSqlite3(dbPath);
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

describe('runPerPillarMigrations', () => {
  it('is a no-op when no pillar has a journal yet', async () => {
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core'), pillar('food')], workspaceOpts());
      expect(result.applied).toEqual([]);
      expect(result.backfilled).toEqual([]);
      expect(result.alreadyApplied).toEqual([]);
      expect(result.pillarsApplied).toEqual([]);
      expect(result.pillarsSkipped).toEqual(['core', 'food']);

      // No tracking tables should be created when there's nothing to do.
      const trackingTables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('__drizzle_migrations', '__pops_migration_tags')"
        )
        .all() as { name: string }[];
      expect(trackingTables).toEqual([]);
    });
  });

  it('applies a single pillar journal end-to-end', async () => {
    writePillarJournal('core', [
      { tag: '0001_core_settings', sql: 'CREATE TABLE settings (key TEXT PRIMARY KEY);' },
      { tag: '0002_core_sync_logs', sql: 'CREATE TABLE sync_logs (id INTEGER PRIMARY KEY);' },
    ]);
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core'), pillar('food')], workspaceOpts());
      expect(result.applied).toEqual(['0001_core_settings', '0002_core_sync_logs']);
      expect(result.pillarsApplied).toEqual(['core']);
      expect(result.pillarsSkipped).toEqual(['food']);

      const names = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((r) => r.name);
      expect(names).toContain('settings');
      expect(names).toContain('sync_logs');
    });
  });

  it('is idempotent — second run reports alreadyApplied without re-applying SQL', async () => {
    writePillarJournal('core', [
      { tag: '0001_core_only', sql: 'CREATE TABLE only_once (id INTEGER);' },
    ]);
    await withDb((db) => {
      const first = runPerPillarMigrations(db, [pillar('core')], workspaceOpts());
      expect(first.applied).toEqual(['0001_core_only']);
      // Insert a sentinel row; the migration would crash on re-run if the
      // CREATE TABLE re-fired without backfill recovery — but the cache
      // skip should keep the table untouched.
      db.exec('INSERT INTO only_once (id) VALUES (1)');

      const second = runPerPillarMigrations(db, [pillar('core')], workspaceOpts());
      expect(second.applied).toEqual([]);
      expect(second.alreadyApplied).toEqual(['0001_core_only']);

      const row = db.prepare('SELECT id FROM only_once').get() as { id: number };
      expect(row.id).toBe(1);
    });
  });

  it('applies multiple pillars in the order they appear in the input list', async () => {
    writePillarJournal('core', [{ tag: '0001_core', sql: 'CREATE TABLE core_t (id INTEGER);' }]);
    writePillarJournal('food', [{ tag: '0001_food', sql: 'CREATE TABLE food_t (id INTEGER);' }]);
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core'), pillar('food')], workspaceOpts());
      expect(result.applied).toEqual(['0001_core', '0001_food']);
      expect(result.pillarsApplied).toEqual(['core', 'food']);
      expect(result.pillarsSkipped).toEqual([]);
    });
  });

  it('skips a pillar whose journal exists but is empty', async () => {
    writePillarJournal('core', []);
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core')], workspaceOpts());
      expect(result.applied).toEqual([]);
      expect(result.pillarsApplied).toEqual([]);
      expect(result.pillarsSkipped).toEqual(['core']);
    });
  });

  it('prefers the installed-package resolver when it returns a path', async () => {
    // Stub an "installed" package at <repoRoot>/installed/core-db; write
    // its migrations there. The workspace fallback path is intentionally
    // left empty so the test fails if the resolver isn't consulted first.
    const installedPkgRoot = join(repoRoot, 'installed', 'core-db');
    mkdirSync(join(installedPkgRoot, 'migrations', 'meta'), { recursive: true });
    writeFileSync(
      join(installedPkgRoot, 'migrations', 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [
          {
            idx: 0,
            version: '7',
            when: 1,
            tag: '0001_from_installed',
            breakpoints: true,
          },
        ],
      })
    );
    writeFileSync(
      join(installedPkgRoot, 'migrations', '0001_from_installed.sql'),
      'CREATE TABLE installed_marker (id INTEGER);'
    );
    await withDb((db) => {
      const result = runPerPillarMigrations(db, [pillar('core')], {
        repoRoot,
        resolveInstalledPackage: (id) => (id === 'core' ? installedPkgRoot : null),
      });
      expect(result.applied).toEqual(['0001_from_installed']);
      expect(result.pillarsApplied).toEqual(['core']);

      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((t) => t.name);
      expect(tables).toContain('installed_marker');
    });
  });

  it('falls back to the real repo root when no override is supplied', async () => {
    // Smoke check: importing the runner under the real layout exercises
    // the workspace fallback path against an actual on-disk pillar dir.
    // `core` owns `packages/core-db/migrations/` with 0054_service_accounts
    // (core pillar Phase 1 PR 2), 0055_pillar_registry (Theme 13 PRD-161
    // registry endpoints), 0056_settings_baseline (PRD-183 US-01 —
    // settings baseline), 0057_ai_usage_baseline (PRD-186 US-01 —
    // ai_inference_log + ai_inference_daily + ai_budgets baseline),
    // 0058_pillar_registry_external_origin, the PRD-186 PR4 trio
    // 0059_ai_model_pricing + 0060_sync_job_results + 0061_ai_usage
    // (Wave 5 unblock — the remaining AI Ops + sync-result tables land
    // in core-db ahead of the hot-path writer cutover), the
    // PRD-186 PR4 ai-alerts slice 0062_ai_alert_rules + 0063_ai_alerts
    // (Wave 5 — moves the evaluator's tables and flips the 7
    // `core/ai-alerts/{alerts-store,evaluator,service}.ts` handler sites
    // to `getCoreDrizzle()`), and the PRD-186 PR4 ai_providers slice
    // 0064_ai_providers (Wave 5 cascade — moves the providers table and
    // flips the 5 `core/ai-providers/service.ts` handler sites plus the
    // `core/ai-budgets/enforcement.ts` mixed-DB pin to
    // `getCoreDrizzle()`), and the PRD-186 PR4 user_settings slice
    // 0066_user_settings (Wave 5 cascade — moves the per-user
    // preferences table and flips the 3
    // `core/features/user-settings.ts` handler sites to
    // `getCoreDrizzle()`);
    // `media` owns `packages/media-db/migrations/`
    // with 0021_spooky_lockheed (media pillar Phase 1 PR 2),
    // 0022_media_movies_baseline (Theme 13 PRD-165 US-01 — movies baseline),
    // 0023_watchlist_baseline (Theme 13 PRD-167 PR 1 — watchlist baseline),
    // 0024_media_tv_shows_baseline (Theme 13 PRD-166 US-01 — tv-shows baseline),
    // 0025_media_watch_history_baseline (Theme 13 PRD-168 PR 1 — watch-history baseline),
    // 0026_media_dismissed_discover_baseline (Theme 13 PRD-170 — dismissed-discover baseline),
    // 0027_media_seasons_baseline + 0028_media_episodes_baseline (Theme 13 PRD-166 PR 4
    // prep — seasons + episodes scaffolded so the addTvShow mixed-tx can move atomically),
    // 0029_media_comparison_staleness_baseline (Theme 13 MEDIA FULL EXIT —
    // comparison_staleness lives on the media handle alongside watch_history),
    // 0030_media_scores_baseline (Theme 13 Wave-5 cascade — media_scores
    // mirrored from shared `0002_magical_kid_colt` + `0015_condemned_anthem`
    // ahead of the comparisons / scores writer cutover; dimension_id stays
    // a soft pointer into pops.db.comparison_dimensions), and
    // 0031_rotation_baseline (Theme 13 Wave-5 cascade — rotation_log +
    // rotation_sources + rotation_candidates + rotation_exclusions mirrored
    // from shared `0028_needy_terror` + `0029_curved_revanche`; intra-pillar
    // `rotation_candidates.source_id → rotation_sources.id` FK preserved);
    // `inventory` owns `packages/inventory-db/migrations/` with
    // 0005_fancy_crystal (inventory pillar Phase 1 PR 2),
    // 0006_inventory_pillar_baseline (inventory pillar Phase 2 PR 3 —
    // comprehensive home_inventory + fixtures + item_* baseline ahead of
    // the cutover), AND 0007_locations_parent_sort_index (#2917 — backfill
    // missing index carried over from shared journal 0009_red_quasimodo);
    // `cerebrum` owns `packages/cerebrum-db/migrations/` with
    // 0039_dry_fabian_cortez and 0044_nudge_log (cerebrum pillar Phase 1
    // PR 2 — nudge_log slice), 0050_engrams_baseline (PRD-179 US-01 —
    // engrams baseline), 0051_glia_baseline (PRD-181 US-01 — glia
    // baseline), 0052_conversations_baseline (PRD-182 US-01 —
    // conversations baseline), 0053_plexus_baseline (PRD-180 US-01 —
    // plexus baseline), and 0054_embeddings_baseline (PRD-186 Wave 5 unblock
    // — embeddings + embeddings_vec slice). Pillars without their own journal
    // yet still skip cleanly.
    await withDb((db) => {
      const realPillars: PillarDescriptor[] = [
        { id: 'core', dbPackageDir: 'packages/core-db' },
        { id: 'media', dbPackageDir: 'packages/media-db' },
        { id: 'inventory', dbPackageDir: 'packages/inventory-db' },
        { id: 'cerebrum', dbPackageDir: 'packages/cerebrum-db' },
        { id: 'unmigrated', dbPackageDir: 'packages/this-dir-does-not-exist-db' },
      ];
      const result = runPerPillarMigrations(db, realPillars);
      expect([...result.applied].toSorted()).toEqual([
        '0005_fancy_crystal',
        '0006_inventory_pillar_baseline',
        '0007_locations_parent_sort_index',
        '0021_spooky_lockheed',
        '0022_media_movies_baseline',
        '0023_watchlist_baseline',
        '0024_media_tv_shows_baseline',
        '0025_media_watch_history_baseline',
        '0026_media_dismissed_discover_baseline',
        '0027_media_seasons_baseline',
        '0028_media_episodes_baseline',
        '0029_media_comparison_staleness_baseline',
        '0030_media_scores_baseline',
        '0031_rotation_baseline',
        '0039_dry_fabian_cortez',
        '0044_nudge_log',
        '0050_engrams_baseline',
        '0051_glia_baseline',
        '0052_conversations_baseline',
        '0053_plexus_baseline',
        '0054_embeddings_baseline',
        '0054_service_accounts',
        '0055_pillar_registry',
        '0056_settings_baseline',
        '0057_ai_usage_baseline',
        '0058_pillar_registry_external_origin',
        '0059_ai_model_pricing',
        '0060_sync_job_results',
        '0061_ai_usage',
        '0062_ai_alert_rules',
        '0063_ai_alerts',
        '0064_ai_providers',
        '0066_user_settings',
      ]);
      expect([...result.pillarsApplied].toSorted()).toEqual([
        'cerebrum',
        'core',
        'inventory',
        'media',
      ]);
      expect(result.pillarsSkipped).toEqual(['unmigrated']);
    });
  });
});
