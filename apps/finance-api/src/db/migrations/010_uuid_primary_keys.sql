-- Migration 010: Replace notion_id primary keys with auto-generated UUIDs
--
-- SQLite cannot ALTER PRIMARY KEY, so each table is rebuilt:
-- 1. Create new table with `id` as PK and `notion_id` as nullable
-- 2. Copy data (id = notion_id for existing rows)
-- 3. Drop old table
-- 4. Rename new table
--
-- This preserves all existing notion_id values as the new `id` for
-- backwards compatibility. New rows will auto-generate UUIDs.

-- ── transactions ─────────────────────────────────────────────────
CREATE TABLE transactions_new (
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
  last_edited_time TEXT NOT NULL
);

INSERT INTO transactions_new (id, notion_id, description, account, amount, date, type, tags, entity_id, entity_name, location, country, related_transaction_id, notes, last_edited_time)
  SELECT notion_id, notion_id, description, account, amount, date, type, tags, entity_id, entity_name, location, country, related_transaction_id, notes, last_edited_time
  FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_transactions_last_edited ON transactions(last_edited_time);
CREATE INDEX IF NOT EXISTS idx_transactions_notion_id ON transactions(notion_id);

-- ── entities ─────────────────────────────────────────────────────
CREATE TABLE entities_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  notion_id TEXT UNIQUE,
  name TEXT NOT NULL,
  type TEXT,
  abn TEXT,
  aliases TEXT,
  default_transaction_type TEXT,
  default_tags TEXT,
  notes TEXT,
  last_edited_time TEXT NOT NULL
);

INSERT INTO entities_new (id, notion_id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time)
  SELECT notion_id, notion_id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time
  FROM entities;

DROP TABLE entities;
ALTER TABLE entities_new RENAME TO entities;

-- ── budgets ──────────────────────────────────────────────────────
CREATE TABLE budgets_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  notion_id TEXT UNIQUE,
  category TEXT NOT NULL,
  period TEXT NOT NULL,
  amount REAL,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  last_edited_time TEXT NOT NULL
);

INSERT INTO budgets_new (id, notion_id, category, period, amount, active, notes, last_edited_time)
  SELECT notion_id, notion_id, category, period, amount, active, notes, last_edited_time
  FROM budgets;

DROP TABLE budgets;
ALTER TABLE budgets_new RENAME TO budgets;

-- ── home_inventory ───────────────────────────────────────────────
CREATE TABLE home_inventory_new (
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

INSERT INTO home_inventory_new (id, notion_id, item_name, brand, model, item_id, room, location, type, condition, in_use, deductible, purchase_date, warranty_expires, replacement_value, resale_value, purchase_transaction_id, purchased_from_id, purchased_from_name, last_edited_time)
  SELECT notion_id, notion_id, item_name, brand, model, item_id, room, location, type, condition, in_use, deductible, purchase_date, warranty_expires, replacement_value, resale_value, purchase_transaction_id, purchased_from_id, purchased_from_name, last_edited_time
  FROM home_inventory;

DROP TABLE home_inventory;
ALTER TABLE home_inventory_new RENAME TO home_inventory;

-- ── wish_list ────────────────────────────────────────────────────
CREATE TABLE wish_list_new (
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

INSERT INTO wish_list_new (id, notion_id, item, target_amount, saved, priority, url, notes, last_edited_time)
  SELECT notion_id, notion_id, item, target_amount, saved, priority, url, notes, last_edited_time
  FROM wish_list;

DROP TABLE wish_list;
ALTER TABLE wish_list_new RENAME TO wish_list;

-- ── transaction_corrections FK update ────────────────────────────
-- Rebuild corrections table to update FK from entities(notion_id) to entities(id)
CREATE TABLE transaction_corrections_new (
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

INSERT INTO transaction_corrections_new (id, description_pattern, match_type, entity_id, entity_name, location, tags, transaction_type, confidence, times_applied, created_at, last_used_at)
  SELECT id, description_pattern, match_type, entity_id, entity_name, location, tags, transaction_type, confidence, times_applied, created_at, last_used_at
  FROM transaction_corrections;

DROP TABLE transaction_corrections;
ALTER TABLE transaction_corrections_new RENAME TO transaction_corrections;

CREATE INDEX IF NOT EXISTS idx_corrections_pattern ON transaction_corrections(description_pattern);
CREATE INDEX IF NOT EXISTS idx_corrections_confidence ON transaction_corrections(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_corrections_times_applied ON transaction_corrections(times_applied DESC);

-- Recreate view after table rebuild
DROP VIEW IF EXISTS v_active_corrections;
CREATE VIEW v_active_corrections AS
SELECT * FROM transaction_corrections
WHERE confidence >= 0.7
ORDER BY confidence DESC, times_applied DESC;
