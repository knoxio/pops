/**
 * Data access for `account_import_config` (POPS-2916, finance ADR-003): how an
 * account expects to be fed.
 *
 * The one rule this layer enforces is that a row names what its kind needs —
 * a `csv-dialect` row without a dialect, or an `api` row without a provider,
 * would be a config nothing can act on and the imports page would show as
 * configured. Everything else (whether the secret exists, whether the
 * external account maps) is checked by the thing that runs the import.
 */
import { and, eq } from 'drizzle-orm';

import { ImportConfigInvalidError } from '../errors.js';
import { accountImportConfig } from '../schema.js';

import type { ImportProvider, ImportSourceKind } from '../../contract/import-source.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `account_import_config`. */
export type AccountImportConfigRow = typeof accountImportConfig.$inferSelect;

/** Fields accepted by {@link upsertImportConfig}; every optional field is stored as null when absent. */
export interface UpsertImportConfigInput {
  accountId: string;
  sourceKind: ImportSourceKind;
  dialectId?: string | null;
  parserId?: string | null;
  provider?: ImportProvider | null;
  externalAccountRef?: string | null;
  expectedCadenceDays?: number | null;
  secretRef?: string | null;
}

function assertKindIsActionable(input: UpsertImportConfigInput): void {
  switch (input.sourceKind) {
    case 'csv-dialect':
      if (!input.dialectId) throw new ImportConfigInvalidError(input.accountId, 'dialectId');
      return;
    case 'pdf-statement':
      if (!input.parserId) throw new ImportConfigInvalidError(input.accountId, 'parserId');
      return;
    case 'api':
      if (!input.provider) throw new ImportConfigInvalidError(input.accountId, 'provider');
      return;
  }
}

/** Every account an `api` source of the given provider feeds, in account-id order so a scheduler pass is deterministic. */
export function listImportConfigsByProvider(
  db: FinanceDb,
  provider: ImportProvider
): AccountImportConfigRow[] {
  return db
    .select()
    .from(accountImportConfig)
    .where(
      and(eq(accountImportConfig.sourceKind, 'api'), eq(accountImportConfig.provider, provider))
    )
    .orderBy(accountImportConfig.accountId)
    .all();
}

/** The account's config, or undefined for an account fed by hand. */
export function getImportConfig(
  db: FinanceDb,
  accountId: string
): AccountImportConfigRow | undefined {
  return db
    .select()
    .from(accountImportConfig)
    .where(eq(accountImportConfig.accountId, accountId))
    .get();
}

/**
 * Create or replace the account's config. A replace overwrites every field —
 * a config is one coherent statement about a source, not a set of
 * independently patchable knobs, so a caller switching kinds cannot leave a
 * stale `dialectId` beside a new `provider`.
 *
 * @throws {ImportConfigInvalidError} when the kind's required field is missing.
 */
export function upsertImportConfig(
  db: FinanceDb,
  input: UpsertImportConfigInput
): AccountImportConfigRow {
  assertKindIsActionable(input);
  const values = {
    sourceKind: input.sourceKind,
    dialectId: input.dialectId ?? null,
    parserId: input.parserId ?? null,
    provider: input.provider ?? null,
    externalAccountRef: input.externalAccountRef ?? null,
    expectedCadenceDays: input.expectedCadenceDays ?? null,
    secretRef: input.secretRef ?? null,
  };
  return db
    .insert(accountImportConfig)
    .values({ accountId: input.accountId, ...values })
    .onConflictDoUpdate({
      target: accountImportConfig.accountId,
      set: { ...values, updatedAt: new Date().toISOString() },
    })
    .returning()
    .get();
}

/** Remove the account's config, returning to "fed by hand". False when there was none. */
export function deleteImportConfig(db: FinanceDb, accountId: string): boolean {
  const existing = getImportConfig(db, accountId);
  if (existing === undefined) return false;
  db.delete(accountImportConfig).where(eq(accountImportConfig.accountId, accountId)).run();
  return true;
}

/** Record that a provider pass ran for the account now, found anything or not. */
export function markSynced(db: FinanceDb, accountId: string, at: Date): void {
  db.update(accountImportConfig)
    .set({ lastSyncedAt: at.toISOString(), updatedAt: at.toISOString() })
    .where(eq(accountImportConfig.accountId, accountId))
    .run();
}
