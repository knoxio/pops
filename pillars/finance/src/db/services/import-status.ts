/**
 * Per-account import status (POPS-2917, finance ADR-003): when an account last got
 * data, what its transactions span, how often it is fed, and by what.
 *
 * Resolved for a whole set of accounts in three grouped queries, like
 * `balancesFor`, so the accounts list costs the same for one account as for
 * fifty. Cadence is derived here, never stored: the median gap between the
 * last {@link CADENCE_WINDOW} batches, null under {@link CADENCE_MIN_BATCHES},
 * so one late import moves the figure and a stored one could not go stale.
 */
import { inArray, max, min, sql } from 'drizzle-orm';

import { isImportProvider } from '../../contract/import-source.js';
import { accountImportConfig, importBatches, transactions } from '../schema.js';

import type { ImportSource, ImportSourceKind } from '../../contract/import-source.js';
import type { AccountImportConfigRow } from './account-import-config.js';
import type { FinanceDb } from './internal.js';

/** Inclusive `YYYY-MM-DD` span. */
export interface DateSpan {
  from: string;
  to: string;
}

/** What every accounts response says about the account's imports. */
export interface ImportStatus {
  /** The later of the newest batch and the last provider pass (`last_synced_at`). */
  lastImportAt: string | null;
  /** When a provider pass last ran for the account; null for one never synced. */
  lastSyncedAt: string | null;
  lastBatchId: string | null;
  newestTransactionDate: string | null;
  /** Min/max date of the account's transactions, however they arrived; null for an empty account. */
  span: DateSpan | null;
  cadenceDays: number | null;
  source: ImportSource | null;
}

const CADENCE_WINDOW = 5;
const CADENCE_MIN_BATCHES = 3;
const MS_PER_DAY = 86_400_000;

interface RecentBatch {
  id: string;
  accountId: string;
  sourceKind: ImportSourceKind;
  sourceRef: string | null;
  createdAt: string;
}

/**
 * Median gap in whole days between consecutive batches, newest first. Null
 * under three batches: two gaps is not a rhythm, and a figure read off them
 * would make a fresh account look either frantic or abandoned.
 */
export function cadenceDaysOf(createdAtNewestFirst: readonly string[]): number | null {
  if (createdAtNewestFirst.length < CADENCE_MIN_BATCHES) return null;
  const stamps = createdAtNewestFirst.map((at) => Date.parse(at));
  const gaps = stamps
    .slice(1)
    .map((older, i) => ((stamps[i] ?? older) - older) / MS_PER_DAY)
    .toSorted((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 0 ? ((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2 : (gaps[mid] ?? 0);
  return Math.round(median);
}

/** The last {@link CADENCE_WINDOW} batches per account, newest first, in one query. */
function recentBatchesFor(db: FinanceDb, accountIds: string[]): Map<string, RecentBatch[]> {
  const rows = db.all<RecentBatch>(sql`
    SELECT id, account_id AS accountId, source_kind AS sourceKind, source_ref AS sourceRef, created_at AS createdAt
    FROM (
      SELECT ${importBatches.id} AS id,
             ${importBatches.accountId} AS account_id,
             ${importBatches.sourceKind} AS source_kind,
             ${importBatches.sourceRef} AS source_ref,
             ${importBatches.createdAt} AS created_at,
             ROW_NUMBER() OVER (
               PARTITION BY ${importBatches.accountId}
               ORDER BY ${importBatches.createdAt} DESC, ${importBatches.id} DESC
             ) AS rn
      FROM ${importBatches}
      WHERE ${inArray(importBatches.accountId, accountIds)}
    )
    WHERE rn <= ${CADENCE_WINDOW}
    ORDER BY account_id, rn
  `);
  const grouped = new Map<string, RecentBatch[]>();
  for (const row of rows) {
    const existing = grouped.get(row.accountId);
    if (existing === undefined) grouped.set(row.accountId, [row]);
    else existing.push(row);
  }
  return grouped;
}

function spansFor(db: FinanceDb, accountIds: string[]): Map<string, DateSpan> {
  const rows = db
    .select({
      accountId: transactions.accountId,
      from: min(transactions.date),
      to: max(transactions.date),
    })
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds))
    .groupBy(transactions.accountId)
    .all();
  const spans = new Map<string, DateSpan>();
  for (const row of rows) {
    if (row.from !== null && row.to !== null) {
      spans.set(row.accountId, { from: row.from, to: row.to });
    }
  }
  return spans;
}

function configsFor(db: FinanceDb, accountIds: string[]): Map<string, AccountImportConfigRow> {
  const rows = db
    .select()
    .from(accountImportConfig)
    .where(inArray(accountImportConfig.accountId, accountIds))
    .all();
  return new Map(rows.map((row) => [row.accountId, row]));
}

function sourceOfConfig(row: AccountImportConfigRow): ImportSource {
  return {
    kind: row.sourceKind,
    dialectId: row.dialectId ?? undefined,
    parserId: row.parserId ?? undefined,
    provider: row.provider ?? undefined,
  };
}

/** A batch names its source by kind: the ref is a dialect, a parser or a provider. */
function sourceOfBatch(batch: RecentBatch): ImportSource {
  const ref = batch.sourceRef ?? undefined;
  switch (batch.sourceKind) {
    case 'csv-dialect':
      return { kind: batch.sourceKind, dialectId: ref };
    case 'pdf-statement':
      return { kind: batch.sourceKind, parserId: ref };
    case 'api':
      return {
        kind: batch.sourceKind,
        provider: ref !== undefined && isImportProvider(ref) ? ref : undefined,
      };
  }
}

function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return b > a ? b : a;
}

function assemble(
  recent: RecentBatch[],
  span: DateSpan | undefined,
  config: AccountImportConfigRow | undefined
): ImportStatus {
  const latest = recent[0];
  let source: ImportSource | null = null;
  if (config !== undefined) source = sourceOfConfig(config);
  else if (latest !== undefined) source = sourceOfBatch(latest);
  const lastSyncedAt = config?.lastSyncedAt ?? null;
  return {
    lastImportAt: laterOf(latest?.createdAt ?? null, lastSyncedAt),
    lastSyncedAt,
    lastBatchId: latest?.id ?? null,
    newestTransactionDate: span?.to ?? null,
    span: span ?? null,
    cadenceDays: cadenceDaysOf(recent.map((batch) => batch.createdAt)),
    source,
  };
}

/** Import status for every given account; an unknown id gets the all-null status. */
export function importStatusFor(db: FinanceDb, accountIds: string[]): Map<string, ImportStatus> {
  if (accountIds.length === 0) return new Map();
  const recent = recentBatchesFor(db, accountIds);
  const spans = spansFor(db, accountIds);
  const configs = configsFor(db, accountIds);
  return new Map(
    accountIds.map((accountId) => [
      accountId,
      assemble(recent.get(accountId) ?? [], spans.get(accountId), configs.get(accountId)),
    ])
  );
}
