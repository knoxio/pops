/**
 * The read half of an Up sync (POPS-30): resolve the account's config and
 * token, fetch the range, map every row, and split what came back into rows
 * the ledger has never seen, rows it holds as pending that Up has since
 * settled, and rows it already has. Nothing here writes, which is what lets
 * the CLI dry-run a backfill before the first real one.
 */
import {
  accountImportConfigService,
  accountsService,
  importsService,
  type FinanceDb,
} from '../../../db/index.js';
import { requireNamedSecret } from '../../secrets.js';
import { toParsedTransaction, type MappedUpTransaction } from './map-transaction.js';
import { createUpBankClient, type UpAccount, type UpBankClient } from './up-api.js';

import type { AccountKind } from '../../../contract/account-kind.js';

/** The account is not mapped onto an Up account, or its config is missing what the sync needs. */
export class UpSyncNotConfiguredError extends Error {
  override readonly name = 'UpSyncNotConfiguredError' as const;
  constructor(
    readonly accountId: string,
    readonly reason: string
  ) {
    super(`Account ${accountId} cannot sync from Up: ${reason}`);
  }
}

/** The Up account holds a different currency from the POPS account mapped to it. */
export class UpSyncCurrencyMismatchError extends Error {
  override readonly name = 'UpSyncCurrencyMismatchError' as const;
  constructor(
    readonly accountId: string,
    readonly accountCurrency: string,
    readonly upCurrency: string
  ) {
    super(`Account ${accountId} is in ${accountCurrency} but its Up account holds ${upCurrency}`);
  }
}

export interface UpSyncArgs {
  accountId: string;
  /** Inclusive `YYYY-MM-DD` range of calendar dates to import. */
  from: string;
  to: string;
  /** Injected by tests and the CLI; built from the config's secret otherwise. */
  client?: UpBankClient;
  /** The day the range ends; today unless a test says otherwise. */
  asOf?: string;
  /** When the pass ran, for `account_import_config.last_synced_at`; now unless a test says otherwise. */
  syncedAt?: Date;
}

/** A stored row Up has since settled, and what it settled to. */
export interface SettleableRow {
  transactionId: string;
  mapped: MappedUpTransaction;
}

export interface UpSyncPlan {
  account: { id: string; name: string; currency: string; kind: AccountKind };
  upAccount: UpAccount;
  fetched: number;
  newRows: MappedUpTransaction[];
  settleable: SettleableRow[];
  alreadyHeld: number;
}

function shiftDay(date: string, days: number): string {
  const stamp = new Date(`${date}T00:00:00Z`);
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}

/**
 * Up filters on instants and the rows carry a local calendar date, so the
 * fetch is widened a day either side in UTC and the calendar filter is applied
 * to what comes back. Fetching a little too much is cheap; missing the first
 * ten hours of `from` is not.
 */
export function fetchRange(from: string, to: string): { since: string; until: string } {
  return { since: `${shiftDay(from, -1)}T00:00:00Z`, until: `${shiftDay(to, 2)}T00:00:00Z` };
}

interface ResolvedClient {
  client: UpBankClient;
  upAccountId: string;
}

function resolveClient(
  db: FinanceDb,
  accountId: string,
  injected: UpBankClient | undefined
): ResolvedClient {
  const config = accountImportConfigService.getImportConfig(db, accountId);
  if (config === undefined) throw new UpSyncNotConfiguredError(accountId, 'no import config');
  if (config.provider !== 'up') {
    throw new UpSyncNotConfiguredError(accountId, `provider is ${config.provider ?? 'none'}`);
  }
  if (!config.externalAccountRef) {
    throw new UpSyncNotConfiguredError(accountId, 'no Up account id (externalAccountRef)');
  }
  if (injected !== undefined) return { client: injected, upAccountId: config.externalAccountRef };
  if (!config.secretRef) throw new UpSyncNotConfiguredError(accountId, 'no secret name');
  return {
    client: createUpBankClient({ token: requireNamedSecret(config.secretRef) }),
    upAccountId: config.externalAccountRef,
  };
}

/** Fetch and map the range without writing anything. */
export async function planUpSync(db: FinanceDb, args: UpSyncArgs): Promise<UpSyncPlan> {
  const account = accountsService.getAccount(db, args.accountId);
  const { client, upAccountId } = resolveClient(db, args.accountId, args.client);

  const upAccount = await client.getAccount(upAccountId);
  const upCurrency = upAccount.attributes.balance.currencyCode;
  if (upCurrency !== account.currency) {
    throw new UpSyncCurrencyMismatchError(account.id, account.currency, upCurrency);
  }

  const raw = await client.listTransactions(upAccountId, fetchRange(args.from, args.to));
  const mapped = raw
    .map((txn) => toParsedTransaction(txn, { accountId: account.id, accountLabel: account.name }))
    .filter(({ parsed }) => parsed.date >= args.from && parsed.date <= args.to);

  const stored = importsService.findTransactionsByChecksums(
    db,
    mapped.map(({ parsed }) => parsed.checksum)
  );
  const newRows: MappedUpTransaction[] = [];
  const settleable: SettleableRow[] = [];
  let alreadyHeld = 0;
  for (const row of mapped) {
    const existing = stored.get(row.parsed.checksum);
    if (existing === undefined) {
      newRows.push(row);
    } else if (existing.pending && !row.parsed.pending) {
      settleable.push({ transactionId: existing.id, mapped: row });
    } else if (row.parsed.pending) {
      alreadyHeld++;
    }
  }

  return {
    account: { id: account.id, name: account.name, currency: account.currency, kind: account.kind },
    upAccount,
    fetched: raw.length,
    newRows,
    settleable,
    alreadyHeld,
  };
}
