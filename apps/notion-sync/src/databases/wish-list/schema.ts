import type Database from 'better-sqlite3';

/** Create the wish_list table. Idempotent. */
export function createWishListTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wish_list (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id        TEXT UNIQUE,
      item             TEXT NOT NULL,
      target_amount    REAL,
      saved            REAL,
      priority         TEXT,
      url              TEXT,
      notes            TEXT,
      last_edited_time TEXT NOT NULL
    );
  `);
}
