import type Database from 'better-sqlite3';

/** Create the home_inventory table. Idempotent. */
export function createInventoryTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS home_inventory (
      id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id              TEXT UNIQUE,
      item_name              TEXT NOT NULL,
      brand                  TEXT,
      model                  TEXT,
      item_id                TEXT,
      room                   TEXT,
      location               TEXT,
      type                   TEXT,
      condition              TEXT,
      in_use                 INTEGER NOT NULL DEFAULT 0,
      deductible             INTEGER NOT NULL DEFAULT 0,
      purchase_date          TEXT,
      warranty_expires       TEXT,
      replacement_value      REAL,
      resale_value           REAL,
      purchase_transaction_id TEXT,
      purchased_from_id      TEXT,
      purchased_from_name    TEXT,
      last_edited_time       TEXT NOT NULL
    );
  `);
}
