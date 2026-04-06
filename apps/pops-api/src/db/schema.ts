/**
 * Database schema initializer.
 *
 * Creates all tables from scratch and pre-marks all known migrations as applied.
 * Used for both fresh prod databases (via scripts/init-db.ts) and new named
 * environments (via the env registry).
 *
 * The migration files (src/db/migrations/*.sql) are ALTER TABLE / one-off DDL
 * statements designed to upgrade existing databases. They must NOT run on fresh
 * databases where the final schema is already created by this function.
 *
 * The schema_migrations table is populated so that runMigrations() is a no-op
 * when it later runs against a database initialized by this function.
 */
import type BetterSqlite3 from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** All migration filenames that this schema already incorporates. */
const INCLUDED_MIGRATIONS = [
  "007_transaction_corrections.sql",
  "008_add_tags_to_transactions.sql",
  "009_environments.sql",
  "010_uuid_primary_keys.sql",
  "011_add_checksum_raw_row.sql",
  "20260320120000_core_entity_types.sql",
  "20260320130000_core_inventory_fks.sql",
  "20260320140000_inventory_new_columns.sql",
  "20260321140000_item_documents.sql",
  "20260322120000_settings.sql",
  "20260324140000_watch_history_unique_index.sql",
  "20260325150000_locations_last_edited_time.sql",
  "20260326120000_transactions_entity_fk.sql",
  "20260326150000_budgets_unique_category_period.sql",
  "20260326160000_items_locations_schema.sql",
  "20260327120000_sync_logs.sql",
  "20260328120000_inventory_asset_id_unique_index.sql",
  "20260328130000_watchlist_source_plex_key.sql",
];

/**
 * Initialize a fresh SQLite database with the full POPS schema.
 * Safe to call on an empty file or an already-initialized database
 * (all statements use CREATE TABLE IF NOT EXISTS).
 *
 * Note: SQLite DEFAULTs use `lower(hex(randomblob(16)))` (32-char hex) as a
 * fallback for direct SQL inserts. Service code always provides proper UUIDs
 * via `crypto.randomUUID()` (RFC 4122 format with dashes).
 */
export function initializeSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id TEXT UNIQUE,
      description TEXT NOT NULL,
      account TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
      entity_name TEXT,
      location TEXT,
      country TEXT,
      related_transaction_id TEXT,
      notes TEXT,
      checksum TEXT,
      raw_row TEXT,
      last_edited_time TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
    CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_last_edited ON transactions(last_edited_time);
    CREATE INDEX IF NOT EXISTS idx_transactions_notion_id ON transactions(notion_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_checksum ON transactions(checksum);

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id TEXT UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'company',
      abn TEXT,
      aliases TEXT,
      default_transaction_type TEXT,
      default_tags TEXT,
      notes TEXT,
      last_edited_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id TEXT UNIQUE,
      category TEXT NOT NULL,
      period TEXT NOT NULL,
      amount REAL,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      last_edited_time TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category_period
      ON budgets(category, COALESCE(period, '__NULL__'));

    CREATE TABLE IF NOT EXISTS locations (
      id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name       TEXT NOT NULL,
      parent_id  TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_edited_time TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
    CREATE INDEX IF NOT EXISTS idx_locations_parent_sort ON locations(parent_id, sort_order);

    CREATE TABLE IF NOT EXISTS home_inventory (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id TEXT UNIQUE,
      item_name TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      item_id TEXT,
      room TEXT,
      location TEXT,
      type TEXT,
      condition TEXT DEFAULT 'good',
      in_use INTEGER,
      deductible INTEGER,
      purchase_date TEXT,
      warranty_expires TEXT,
      replacement_value REAL,
      resale_value REAL,
      purchase_transaction_id TEXT,
      purchased_from_id TEXT,
      purchased_from_name TEXT,
      last_edited_time TEXT NOT NULL,
      asset_id TEXT UNIQUE,
      notes TEXT,
      purchase_price REAL,
      location_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (purchase_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
      FOREIGN KEY (purchased_from_id) REFERENCES entities(id) ON DELETE SET NULL,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_asset_id ON home_inventory(asset_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON home_inventory(item_name);
    CREATE INDEX IF NOT EXISTS idx_inventory_location ON home_inventory(location_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_type ON home_inventory(type);
    CREATE INDEX IF NOT EXISTS idx_inventory_warranty ON home_inventory(warranty_expires);

    CREATE TABLE IF NOT EXISTS item_connections (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      item_a_id  TEXT NOT NULL,
      item_b_id  TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_a_id) REFERENCES home_inventory(id) ON DELETE CASCADE,
      FOREIGN KEY (item_b_id) REFERENCES home_inventory(id) ON DELETE CASCADE,
      CHECK (item_a_id < item_b_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_item_connections_pair ON item_connections(item_a_id, item_b_id);
    CREATE INDEX IF NOT EXISTS idx_item_connections_a ON item_connections(item_a_id);
    CREATE INDEX IF NOT EXISTS idx_item_connections_b ON item_connections(item_b_id);

    CREATE TABLE IF NOT EXISTS item_photos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id    TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      caption    TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES home_inventory(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_item_photos_item ON item_photos(item_id);

    CREATE TABLE IF NOT EXISTS item_documents (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id                TEXT NOT NULL,
      paperless_document_id  INTEGER NOT NULL,
      document_type          TEXT NOT NULL,
      title                  TEXT,
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES home_inventory(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_item_documents_pair ON item_documents(item_id, paperless_document_id);
    CREATE INDEX IF NOT EXISTS idx_item_documents_item ON item_documents(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_documents_doc ON item_documents(paperless_document_id);

    CREATE TABLE IF NOT EXISTS wish_list (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id TEXT UNIQUE,
      item TEXT NOT NULL,
      target_amount REAL,
      saved REAL,
      priority TEXT,
      url TEXT,
      notes TEXT,
      last_edited_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      entity_name TEXT,
      category TEXT,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      cached INTEGER NOT NULL DEFAULT 0,
      import_batch_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_batch ON ai_usage(import_batch_id);

    CREATE TABLE IF NOT EXISTS transaction_corrections (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      description_pattern TEXT NOT NULL,
      match_type TEXT CHECK(match_type IN ('exact', 'contains', 'regex')) NOT NULL DEFAULT 'exact',
      entity_id TEXT,
      entity_name TEXT,
      location TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      transaction_type TEXT CHECK(transaction_type IN ('purchase', 'transfer', 'income')),
      confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0.0 AND confidence <= 1.0),
      times_applied INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_corrections_pattern ON transaction_corrections(description_pattern);
    CREATE INDEX IF NOT EXISTS idx_corrections_confidence ON transaction_corrections(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_corrections_times_applied ON transaction_corrections(times_applied DESC);

    CREATE VIEW IF NOT EXISTS v_active_corrections AS
    SELECT * FROM transaction_corrections
    WHERE confidence >= 0.7
    ORDER BY confidence DESC, times_applied DESC;

    CREATE TABLE IF NOT EXISTS environments (
      name       TEXT    PRIMARY KEY CHECK(name != 'prod'),
      db_path    TEXT    NOT NULL,
      seed_type  TEXT    NOT NULL DEFAULT 'none' CHECK(seed_type IN ('none', 'test')),
      ttl_seconds INTEGER,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_environments_expires_at ON environments(expires_at);

    CREATE TABLE IF NOT EXISTS movies (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id              INTEGER NOT NULL,
      imdb_id              TEXT,
      title                TEXT NOT NULL,
      original_title       TEXT,
      overview             TEXT,
      tagline              TEXT,
      release_date         TEXT,
      runtime              INTEGER,
      status               TEXT,
      original_language    TEXT,
      budget               INTEGER,
      revenue              INTEGER,
      poster_path          TEXT,
      backdrop_path        TEXT,
      logo_path            TEXT,
      poster_override_path TEXT,
      discover_rating_key  TEXT,
      vote_average         REAL,
      vote_count           INTEGER,
      genres               TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
    CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date);

    CREATE TABLE IF NOT EXISTS tv_shows (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      tvdb_id              INTEGER NOT NULL,
      name                 TEXT NOT NULL,
      original_name        TEXT,
      overview             TEXT,
      first_air_date       TEXT,
      last_air_date        TEXT,
      status               TEXT,
      original_language    TEXT,
      number_of_seasons    INTEGER,
      number_of_episodes   INTEGER,
      episode_run_time     INTEGER,
      poster_path          TEXT,
      backdrop_path        TEXT,
      logo_path            TEXT,
      poster_override_path TEXT,
      discover_rating_key  TEXT,
      vote_average         REAL,
      vote_count           INTEGER,
      genres               TEXT,
      networks             TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tv_shows_tvdb_id ON tv_shows(tvdb_id);
    CREATE INDEX IF NOT EXISTS idx_tv_shows_name ON tv_shows(name);

    CREATE TABLE IF NOT EXISTS seasons (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tv_show_id    INTEGER NOT NULL REFERENCES tv_shows(id) ON DELETE CASCADE,
      tvdb_id       INTEGER NOT NULL,
      season_number INTEGER NOT NULL,
      name          TEXT,
      overview      TEXT,
      poster_path   TEXT,
      air_date      TEXT,
      episode_count INTEGER,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_tvdb_id ON seasons(tvdb_id);
    CREATE INDEX IF NOT EXISTS idx_seasons_tv_show_id ON seasons(tv_show_id);

    CREATE TABLE IF NOT EXISTS episodes (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id      INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      tvdb_id        INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      name           TEXT,
      overview       TEXT,
      air_date       TEXT,
      still_path     TEXT,
      vote_average   REAL,
      runtime        INTEGER,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_tvdb_id ON episodes(tvdb_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_season_id ON episodes(season_id);

    CREATE TABLE IF NOT EXISTS comparison_dimensions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      weight      REAL NOT NULL DEFAULT 1.0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comparison_dimensions_name ON comparison_dimensions(name);

    CREATE TABLE IF NOT EXISTS comparisons (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension_id  INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      media_a_type  TEXT NOT NULL,
      media_a_id    INTEGER NOT NULL,
      media_b_type  TEXT NOT NULL,
      media_b_id    INTEGER NOT NULL,
      winner_type   TEXT NOT NULL,
      winner_id     INTEGER NOT NULL,
      draw_tier     TEXT,
      delta_a       INTEGER,
      delta_b       INTEGER,
      compared_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comparisons_dimension_id ON comparisons(dimension_id);
    CREATE INDEX IF NOT EXISTS idx_comparisons_media_a ON comparisons(media_a_type, media_a_id);
    CREATE INDEX IF NOT EXISTS idx_comparisons_media_b ON comparisons(media_b_type, media_b_id);

    CREATE TABLE IF NOT EXISTS media_scores (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type       TEXT NOT NULL,
      media_id         INTEGER NOT NULL,
      dimension_id     INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      score            REAL NOT NULL DEFAULT 1500.0,
      comparison_count INTEGER NOT NULL DEFAULT 0,
      excluded         INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_scores_unique ON media_scores(media_type, media_id, dimension_id);
    CREATE INDEX IF NOT EXISTS idx_media_scores_dimension ON media_scores(dimension_id);

    CREATE TABLE IF NOT EXISTS comparison_staleness (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type TEXT NOT NULL,
      media_id   INTEGER NOT NULL,
      staleness  REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comparison_staleness_unique ON comparison_staleness(media_type, media_id);

    CREATE TABLE IF NOT EXISTS watchlist (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type       TEXT NOT NULL CHECK(media_type IN ('movie', 'tv_show')),
      media_id         INTEGER NOT NULL,
      priority         INTEGER DEFAULT 0,
      notes            TEXT,
      added_at         TEXT NOT NULL DEFAULT (datetime('now')),
      source           TEXT NOT NULL DEFAULT 'manual',
      plex_rating_key  TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_media ON watchlist(media_type, media_id);

    CREATE TABLE IF NOT EXISTS watch_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type  TEXT NOT NULL CHECK(media_type IN ('movie', 'episode')),
      media_id    INTEGER NOT NULL,
      watched_at  TEXT NOT NULL DEFAULT (datetime('now')),
      completed   INTEGER NOT NULL DEFAULT 1,
      blacklisted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_watch_history_media ON watch_history(media_type, media_id);
    CREATE INDEX IF NOT EXISTS idx_watch_history_watched_at ON watch_history(watched_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_history_unique ON watch_history(media_type, media_id, watched_at);

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at     TEXT NOT NULL,
      movies_synced INTEGER NOT NULL DEFAULT 0,
      tv_shows_synced INTEGER NOT NULL DEFAULT 0,
      errors        TEXT,
      duration_ms   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sync_logs_synced_at ON sync_logs(synced_at);

    CREATE TABLE IF NOT EXISTS dismissed_discover (
      tmdb_id INTEGER PRIMARY KEY,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_job_results (
      id            TEXT PRIMARY KEY,
      job_type      TEXT NOT NULL,
      status        TEXT NOT NULL,
      started_at    TEXT NOT NULL,
      completed_at  TEXT,
      duration_ms   INTEGER,
      progress      TEXT,
      result        TEXT,
      error         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_job_results_type_completed
      ON sync_job_results(job_type, completed_at);

    CREATE TABLE IF NOT EXISTS debrief_sessions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_history_id  INTEGER NOT NULL REFERENCES watch_history(id),
      status            TEXT NOT NULL DEFAULT 'pending',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debrief_results (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      INTEGER NOT NULL REFERENCES debrief_sessions(id),
      dimension_id    INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      comparison_id   INTEGER REFERENCES comparisons(id),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comparison_skip_cooloffs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension_id INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      media_a_type TEXT NOT NULL,
      media_a_id   INTEGER NOT NULL,
      media_b_type TEXT NOT NULL,
      media_b_id   INTEGER NOT NULL,
      skip_until   INTEGER NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comparison_skip_cooloffs_pair
      ON comparison_skip_cooloffs(dimension_id, media_a_type, media_a_id, media_b_type, media_b_id);

    CREATE TABLE IF NOT EXISTS tier_overrides (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type   TEXT NOT NULL,
      media_id     INTEGER NOT NULL,
      dimension_id INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      tier         TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_overrides_unique
      ON tier_overrides(media_type, media_id, dimension_id);

    CREATE TABLE IF NOT EXISTS debrief_status (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      media_type   TEXT NOT NULL,
      media_id     INTEGER NOT NULL,
      dimension_id INTEGER NOT NULL REFERENCES comparison_dimensions(id),
      debriefed    INTEGER NOT NULL DEFAULT 0,
      dismissed    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS debrief_status_media_dimension_idx
      ON debrief_status(media_type, media_id, dimension_id);

    CREATE TABLE IF NOT EXISTS shelf_impressions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      shelf_id TEXT NOT NULL,
      shown_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_shelf_impressions_shelf_id ON shelf_impressions(shelf_id);
  `);

  // Pre-mark all migrations this schema already incorporates so that
  // runMigrations() treats them as already applied.
  const insertMigration = db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)"
  );
  for (const migration of INCLUDED_MIGRATIONS) {
    insertMigration.run(migration);
  }

  // Also mark all Drizzle migrations as applied (schema already incorporates them)
  try {
    const drizzleMigrationsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "drizzle-migrations"
    );
    const journalPath = join(drizzleMigrationsDir, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };

    db.exec(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at NUMERIC
      )
    `);

    const insertDrizzle = db.prepare(
      "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
    );
    for (const entry of journal.entries) {
      insertDrizzle.run(entry.tag, Date.now());
    }
  } catch {
    // Non-fatal — Drizzle migrate at startup will handle it
  }
}
