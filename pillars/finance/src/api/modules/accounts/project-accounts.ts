/**
 * Project account rows to their wire shape, resolving the things a row does
 * not carry: the contact display name (live from contacts, POPS-2771), the
 * checkpoint-anchored balance (finance ADR-002), the import status (POPS-2917), and
 * the transaction count (POPS-2924).
 *
 * All four are resolved for the WHOLE set at once. `balancesFor` costs three
 * grouped queries regardless of how many accounts are on the page, where a
 * per-row `balanceAsOf` would cost a handful each; `resolveAccountEntityDisplays`
 * already batched its side, and `transactionCountsFor` is one more grouped
 * query rather than a count per row. Every accounts response — the list, one
 * account, a merge preview — goes through here so none of them can drift
 * into an N+1.
 */
import {
  balancesFor,
  importStatusFor,
  resolveAccountEntityDisplays,
  today,
  transactionCountsFor,
  type AccountBalance,
  type AccountEntityDisplay,
  type ImportStatus,
} from '../../../db/index.js';
import { toAccount, type Account } from '../accounts-types.js';

import type { AccountRow, FinanceDb } from '../../../db/index.js';
import type { ContactsClient } from '../../contacts/client.js';

const NO_ISSUER: AccountEntityDisplay = {
  entityDisplayName: null,
  entityDisplayNameStale: false,
  entityColour: null,
  entityAvatarAssetId: null,
  resolvedEntityId: null,
};

/**
 * The balance shown when there is nothing to compute one from. Unreachable in
 * practice — `balancesFor` answers for every id it is given — and present only
 * so a missing entry degrades to a stated zero rather than to `undefined`
 * crossing the wire against a required field.
 */
const NO_BALANCE: AccountBalance = {
  balanceCents: 0,
  asOf: '',
  basis: 'transactions',
  anchor: null,
  inconsistent: false,
};

/** Same standing as {@link NO_BALANCE}: what an account never imported into says. */
const NO_IMPORT_STATUS: ImportStatus = {
  lastImportAt: null,
  lastSyncedAt: null,
  lastBatchId: null,
  newestTransactionDate: null,
  span: null,
  cadenceDays: null,
  source: null,
};

/** Batched projections of account rows to their wire shape. */
export interface AccountProjector {
  many: (rows: AccountRow[], date?: string) => Promise<Account[]>;
  one: (row: AccountRow) => Promise<Account>;
}

export function makeAccountProjector(db: FinanceDb, contacts: ContactsClient): AccountProjector {
  async function many(rows: AccountRow[], date = today()): Promise<Account[]> {
    const displays = await resolveAccountEntityDisplays(contacts, rows);
    const ids = rows.map((row) => row.id);
    const balances = balancesFor(db, ids, date);
    const statuses = importStatusFor(db, ids);
    const transactionCounts = transactionCountsFor(db, ids);
    return rows.map((row) =>
      toAccount(row, displays.get(row.id) ?? NO_ISSUER, {
        balance: balances.get(row.id) ?? NO_BALANCE,
        importStatus: statuses.get(row.id) ?? NO_IMPORT_STATUS,
        transactionCount: transactionCounts.get(row.id) ?? 0,
      })
    );
  }

  async function one(row: AccountRow): Promise<Account> {
    const [account] = await many([row]);
    return (
      account ??
      toAccount(row, NO_ISSUER, {
        balance: NO_BALANCE,
        importStatus: NO_IMPORT_STATUS,
        transactionCount: 0,
      })
    );
  }

  return { many, one };
}
