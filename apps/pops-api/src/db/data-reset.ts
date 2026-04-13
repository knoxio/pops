/**
 * Full application data wipe + bare-minimum system seed.
 *
 * Used by `db:clear` (wipe + minimum) and `seedDatabase` (wipe + minimum + fixtures).
 * Preserves migration bookkeeping: `schema_migrations`, `__drizzle_migrations`.
 */
import type BetterSqlite3 from 'better-sqlite3';

import { TAG_VOCABULARY_V1 } from '../shared/tag-vocabulary.js';

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
  'ai_usage',
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
  for (const name of APPLICATION_TABLES) {
    db.exec(`DELETE FROM "${name}"`);
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
