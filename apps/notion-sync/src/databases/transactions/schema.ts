import type Database from 'better-sqlite3';

/** Create the transactions table and its indexes. Idempotent. */
export function createTransactionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id       TEXT UNIQUE,
      description     TEXT NOT NULL,
      account         TEXT NOT NULL,
      amount          REAL NOT NULL,
      date            TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT '',
      tags            TEXT NOT NULL DEFAULT '[]',
      entity_id       TEXT,
      entity_name     TEXT,
      location        TEXT,
      country         TEXT,
      related_transaction_id TEXT,
      notes           TEXT,
      checksum        TEXT,
      raw_row         TEXT,
      last_edited_time TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
    CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_last_edited ON transactions(last_edited_time);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_checksum ON transactions(checksum);
  `);
}
