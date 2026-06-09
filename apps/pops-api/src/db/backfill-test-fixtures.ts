/**
 * SQL fixture for the `backfill-core-from-shared.test.ts` suite.
 *
 * Inlined here (rather than reading the canonical drizzle-migration
 * `0054_service_accounts.sql`) so the test stays robust against the
 * eventual phase-2-PR4 deletion of that shared-journal copy. The DDL
 * matches the byte-identical migration that lands in both
 * `apps/pops-api/src/db/drizzle-migrations/` and
 * `packages/core-db/migrations/`.
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
