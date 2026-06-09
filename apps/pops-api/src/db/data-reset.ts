import { TAG_VOCABULARY_V1 } from '../shared/tag-vocabulary.js';

/**
 * Full application data wipe + bare-minimum system seed.
 *
 * Used by `db:clear` (wipe + minimum) and `seedDatabase` (wipe + minimum + fixtures).
 * Preserves migration bookkeeping: `schema_migrations`, `__drizzle_migrations`.
 */
import type BetterSqlite3 from 'better-sqlite3';

/**
 * Application tables whose rows are deleted on reset.
 * Order is defensive (children before parents); `foreign_keys` is turned off for the wipe.
 * Keep in sync with `initializeSchema` in `schema.ts` when new tables ship.
 */
const APPLICATION_TABLES = [
  'debrief_results',
  'debrief_sessions',
  'debrief_status',
  'comparison_skip_cooloffs',
  'tier_overrides',
  'media_scores',
  'comparisons',
  'watch_history',
  'watchlist',
  'episodes',
  'seasons',
  'tv_shows',
  'movies',
  'comparison_staleness',
  'item_documents',
  'item_photos',
  'item_connections',
  'home_inventory',
  'transactions',
  'locations',
  'entities',
  'budgets',
  'wish_list',
  'ai_inference_log',
  'ai_model_pricing',
  'ai_providers',
  'ai_budgets',
  'transaction_corrections',
  'transaction_tag_rules',
  'environments',
  'settings',
  'sync_logs',
  'dismissed_discover',
  'sync_job_results',
  'shelf_impressions',
  'rotation_log',
  'rotation_candidates',
  'rotation_exclusions',
  'rotation_sources',
  'comparison_dimensions',
  'tag_vocabulary',
  // Lists (PRD-112) — children first.
  'list_items',
  'lists',
  // Food (PRD-106 → PRD-112) — children first, parents last so FK order holds
  // even when `foreign_keys = ON` (the wipe runs with FKs OFF, but the order
  // is documented as a safety net in case a caller forgets to disable them).
  'batch_consumptions',
  'recipe_runs',
  'batches',
  'plan_entries',
  'plan_slots',
  'substitutions',
  'recipe_tags',
  'recipe_versions',
  'recipes',
  'ingredient_aliases',
  'ingredient_variants',
  'prep_states',
  'ingredients',
  'slug_registry',
] as const;

function resetAutoIncrementSequences(db: BetterSqlite3.Database): void {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`)
    .get() as { ok: 1 } | undefined;
  if (row) {
    db.exec('DELETE FROM sqlite_sequence');
  }
}

/** Delete all application rows (call with `PRAGMA foreign_keys = OFF` if FK order is unknown). */
export function deleteAllApplicationRows(db: BetterSqlite3.Database): void {
  // Some legacy migration-safety tests apply only a subset of migrations, so
  // not every table in the list will exist. Skip missing tables rather than
  // throwing — the wipe semantics are "if it's there, clear it".
  const existing = new Set(
    (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
        name: string;
      }[]
    ).map((row) => row.name)
  );
  for (const name of APPLICATION_TABLES) {
    if (existing.has(name)) {
      db.exec(`DELETE FROM "${name}"`);
    }
  }
  resetAutoIncrementSequences(db);
}

/**
 * Minimum rows expected on a “fresh” dev database after a wipe (matches `initializeSchema` tail).
 */
export function seedBareMinimum(db: BetterSqlite3.Database): void {
  const insertTag = db.prepare(
    "INSERT OR IGNORE INTO tag_vocabulary (tag, source, is_active) VALUES (?, 'seed', 1)"
  );
  for (const tag of TAG_VOCABULARY_V1) {
    insertTag.run(tag);
  }

  db.exec(`
    INSERT OR IGNORE INTO rotation_sources (id, type, name, priority, enabled)
    VALUES (1, 'manual', 'Manual Queue', 8, 1)
  `);
}

/** Clear everything, then restore tag vocabulary + default rotation source. */
export function resetToBareMinimum(db: BetterSqlite3.Database): void {
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      deleteAllApplicationRows(db);
      seedBareMinimum(db);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
