import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Service accounts: machine identities that authenticate to pops-api via
 * `X-API-Key: <prefix>.<secret>` headers (PRD-088, issue #2496).
 *
 * Storage rules
 * - `keyPrefix` is the first 8 chars of the issued key, stored in plain
 *   text so the verifier can `WHERE key_prefix = ?` in O(1) before the
 *   constant-time hash compare.
 * - `keyHash` is `scrypt(secret, salt)` encoded as `scrypt$<salt_b64>$<hash_b64>`.
 *   The plaintext key is shown to the operator exactly once at creation
 *   time and never persisted.
 * - `scopes` is a JSON-encoded array of tRPC procedure prefixes the
 *   account can call (e.g. `['cerebrum.ingest', 'cerebrum.query']`). An
 *   empty array means no access — never use `['*']` as a wildcard;
 *   instead enumerate explicitly so revocation/audit is exact.
 * - `revokedAt` is a soft-delete: revoked rows stay around for audit but
 *   can never authenticate.
 */
export const serviceAccounts = sqliteTable(
  'service_accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    keyPrefix: text('key_prefix').notNull().unique(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').notNull().default('[]'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_service_accounts_key_prefix').on(table.keyPrefix),
    index('idx_service_accounts_revoked_at').on(table.revokedAt),
  ]
);
