import type Database from 'better-sqlite3';

/** Create the entities table and its indexes. Idempotent. */
export function createEntitiesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id                       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id                TEXT UNIQUE,
      name                     TEXT NOT NULL,
      type                     TEXT,
      abn                      TEXT,
      aliases                  TEXT,
      default_transaction_type TEXT,
      default_tags             TEXT,
      notes                    TEXT,
      last_edited_time         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
  `);
}
