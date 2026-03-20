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

/** All migration filenames that this schema already incorporates. */
const INCLUDED_MIGRATIONS = [
  "007_transaction_corrections.sql",
  "008_add_tags_to_transactions.sql",
  "009_environments.sql",
  "010_uuid_primary_keys.sql",
  "011_add_checksum_raw_row.sql",
  "20260320120000_core_entity_types.sql",
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
      entity_id TEXT,
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
      condition TEXT,
      in_use INTEGER,
      deductible INTEGER,
      purchase_date TEXT,
      warranty_expires TEXT,
      replacement_value REAL,
      resale_value REAL,
      purchase_transaction_id TEXT,
      purchased_from_id TEXT,
      purchased_from_name TEXT,
      last_edited_time TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Pre-mark all migrations this schema already incorporates so that
  // runMigrations() treats them as already applied.
  const insertMigration = db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)"
  );
  for (const migration of INCLUDED_MIGRATIONS) {
    insertMigration.run(migration);
  }
}
