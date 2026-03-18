import type Database from 'better-sqlite3';

/** Create the budgets table and its indexes. Idempotent. */
export function createBudgetsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      notion_id        TEXT UNIQUE,
      category         TEXT NOT NULL,
      period           TEXT,
      amount           REAL,
      active           INTEGER NOT NULL DEFAULT 0,
      notes            TEXT,
      last_edited_time TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
  `);
}
