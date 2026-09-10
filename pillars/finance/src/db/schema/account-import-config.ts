import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { IMPORT_PROVIDERS, IMPORT_SOURCE_KINDS } from '../../contract/import-source.js';
import { accounts } from './accounts.js';

/**
 * How an account expects to be fed (POPS-2916, finance ADR-003): one row per account,
 * or none for an account fed by hand.
 *
 * This is its own table rather than columns on `accounts` because finance ADR-001
 * made `kind` a discriminator and nothing more — the account row says what it
 * is, this row says how transactions reach it. The two change for different
 * reasons: switching a card from CSV drops to the Up API touches this row and
 * nothing about the account.
 *
 * `secret_ref` names a docker/env secret; the token itself is read from
 * `<secret_ref>_FILE` or the environment at sync time, the way
 * `UP_WEBHOOK_SECRET_FILE` already is, and never lands in this database.
 */
export const accountImportConfig = sqliteTable('account_import_config', {
  /** FK → `accounts.id`, cascading: a config for an account that no longer exists has no reader. */
  accountId: text('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  sourceKind: text('source_kind', { enum: IMPORT_SOURCE_KINDS }).notNull(),
  /** The `BankDialectId` a `csv-dialect` account's exports are parsed with. */
  dialectId: text('dialect_id'),
  /** The parser a `pdf-statement` account's statements are read by. */
  parserId: text('parser_id'),
  provider: text('provider', { enum: IMPORT_PROVIDERS }),
  /** The provider's own id for this account — the Up account id an `api` sync maps onto this row. */
  externalAccountRef: text('external_account_ref'),
  /** Days between feeds this account is expected to keep; null means derive it from batch history. */
  expectedCadenceDays: integer('expected_cadence_days'),
  /** Name of the secret holding the provider token. Never the token. */
  secretRef: text('secret_ref'),
  /**
   * When a provider pass last ran, whether or not it found anything. A batch
   * is only written at commit (finance ADR-005), so staleness could not
   * otherwise tell a quiet account from a sync that stopped running.
   */
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
