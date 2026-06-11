/**
 * SQL fixtures for the per-pillar backfill suites.
 *
 * Inlined here (rather than reading the canonical drizzle-migration
 * files) so the tests stay robust against the eventual phase-2-PR4
 * deletion of those shared-journal copies. Each DDL matches the
 * byte-identical migration that lands in both
 * `apps/pops-api/src/db/drizzle-migrations/` and
 * `packages/<id>-db/migrations/`.
 */
export const SERVICE_ACCOUNTS_TABLE_SQL = `
CREATE TABLE service_accounts (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text DEFAULT '[]' NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  last_used_at text,
  revoked_at text,
  created_by text
);
CREATE UNIQUE INDEX service_accounts_name_unique ON service_accounts (name);
CREATE UNIQUE INDEX service_accounts_key_prefix_unique ON service_accounts (key_prefix);
CREATE INDEX idx_service_accounts_key_prefix ON service_accounts (key_prefix);
CREATE INDEX idx_service_accounts_revoked_at ON service_accounts (revoked_at);
`;

export const SHELF_IMPRESSIONS_TABLE_SQL = `
CREATE TABLE shelf_impressions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  shelf_id text NOT NULL,
  shown_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_shelf_impressions_shelf_id ON shelf_impressions (shelf_id);
`;

export const WISH_LIST_TABLE_SQL = `
CREATE TABLE wish_list (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  item text NOT NULL,
  target_amount real,
  saved real,
  priority text,
  url text,
  notes text,
  last_edited_time text NOT NULL
);
CREATE UNIQUE INDEX wish_list_notion_id_unique ON wish_list (notion_id);
`;

export const ENTITIES_TABLE_SQL = `
CREATE TABLE entities (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  name text NOT NULL,
  type text DEFAULT 'company' NOT NULL,
  abn text,
  aliases text,
  default_transaction_type text,
  default_tags text,
  notes text,
  last_edited_time text NOT NULL
);
CREATE UNIQUE INDEX entities_notion_id_unique ON entities (notion_id);
`;

export const TRANSACTIONS_TABLE_SQL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount real NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text DEFAULT '[]' NOT NULL,
  entity_id text,
  entity_name text,
  location text,
  country text,
  related_transaction_id text,
  notes text,
  checksum text,
  raw_row text,
  last_edited_time text NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON UPDATE no action ON DELETE set null
);
CREATE UNIQUE INDEX transactions_notion_id_unique ON transactions (notion_id);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE UNIQUE INDEX idx_transactions_checksum ON transactions (checksum);
`;

export const TRANSACTION_CORRECTIONS_TABLE_SQL = `
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  match_type text DEFAULT 'exact' NOT NULL,
  entity_id text,
  entity_name text,
  location text,
  tags text DEFAULT '[]' NOT NULL,
  transaction_type text,
  is_active integer DEFAULT 1 NOT NULL,
  confidence real DEFAULT 0.5 NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  times_applied integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  last_used_at text,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON UPDATE no action ON DELETE set null
);
`;

export const TRANSACTION_TAG_RULES_TABLE_SQL = `
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  match_type text DEFAULT 'exact' NOT NULL,
  entity_id text,
  tags text DEFAULT '[]' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  confidence real DEFAULT 0.5 NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  times_applied integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  last_used_at text,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON UPDATE no action ON DELETE set null
);
`;

export const TAG_VOCABULARY_TABLE_SQL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
`;

export const BUDGETS_TABLE_SQL = `
CREATE TABLE budgets (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  category text NOT NULL,
  period text,
  amount real,
  active integer DEFAULT 0 NOT NULL,
  notes text,
  last_edited_time text NOT NULL
);
CREATE UNIQUE INDEX budgets_notion_id_unique ON budgets (notion_id);
CREATE UNIQUE INDEX idx_budgets_category_period ON budgets (category, COALESCE(period, char(0)));
`;
