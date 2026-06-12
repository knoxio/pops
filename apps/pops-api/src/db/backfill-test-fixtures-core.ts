/**
 * SQL fixtures for the core-pillar backfill suite. Split out of
 * `backfill-test-fixtures.ts` to keep each file under the 200-line cap.
 * See that module's header for why these DDLs live alongside the tests.
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

export const SETTINGS_TABLE_SQL = `
CREATE TABLE settings (
  key text PRIMARY KEY NOT NULL,
  value text NOT NULL
);
`;
