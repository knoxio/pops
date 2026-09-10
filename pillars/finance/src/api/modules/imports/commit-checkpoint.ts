import {
  getAccountKindBehaviour,
  type AccountKindBehaviour,
} from '../../../contract/account-kind.js';
/**
 * Mint an `import`-sourced account checkpoint from a statement's own printed
 * closing balance, at commit time (POPS-2882, off POPS-2878/2879).
 *
 * A parser that reads a running balance off the source file (currently only
 * the ANZ PDF statement importer, `anz-pdf-statement.ts`) stamps every row it
 * finds one on with `balanceCents` (unsigned) and an optional `balanceMarker`.
 * The chronologically last such row — max `date`, ties broken by whichever
 * came later in the payload's own order — is the statement's closing balance,
 * and becomes a checkpoint once ledger-signed against the account's `kind`.
 *
 * Rows the user deselected in review don't change this: the bank's figure
 * stands, and `writeTransactionsPhase`'s `failedChecksums` is the only filter
 * — a row that failed to WRITE cannot anchor a checkpoint, but one the user
 * chose not to import still can, because the statement printed it regardless.
 *
 * A duplicate `(account, date, source)` — re-running the same import — is
 * caught via {@link isCheckpointConflict} and silently skipped: that is the
 * expected outcome of a re-import, not a fault, and the partial-unique index
 * (POPS-2878) is what makes skipping safe rather than a race.
 */
import {
  accountCheckpointsService,
  accountsService,
  checkpointDelta,
  isCheckpointConflict,
  resolveImportAccountId,
  type FinanceDb,
} from '../../../db/index.js';

import type { CommitCheckpoint, ConfirmedTransaction, ImportWarning } from './types.js';

/**
 * What `mintImportCheckpointsPhase` produces: one checkpoint per account the
 * commit minted for, and the warnings they raised. A commit spans more than
 * one account whenever a row was retargeted in review, so this is a list —
 * collapsing it to a single field would drop every account but the last.
 */
export interface ImportCheckpointResult {
  checkpoints: CommitCheckpoint[];
  warnings: ImportWarning[];
}

interface ClosingBalanceCandidate {
  accountId: string;
  date: string;
  balanceCents: number;
  balanceMarker?: 'CR' | 'DR';
}

/**
 * Ledger-sign a statement's printed (unsigned) closing balance (POPS-2882).
 *
 * A liability's printed figure is money owed, so the default is negative;
 * `CR` — the balance is in the customer's favour — flips it positive. An
 * asset's printed figure is money held, so the default is positive; `DR` —
 * the account is overdrawn — flips it negative. The four combinations:
 *
 * | signConvention | marker | signed          |
 * | -------------- | ------ | --------------- |
 * | liability      | none   | `-balanceCents` |
 * | liability      | CR     | `+balanceCents` |
 * | asset          | none   | `+balanceCents` |
 * | asset          | DR     | `-balanceCents` |
 */
export function signStatementBalance(
  balanceCents: number,
  marker: 'CR' | 'DR' | undefined,
  signConvention: AccountKindBehaviour['signConvention']
): number {
  const magnitude = Math.abs(balanceCents);
  const flipped = signConvention === 'liability' ? marker === 'CR' : marker === 'DR';
  const negative = signConvention === 'liability' ? !flipped : flipped;
  return negative ? -magnitude : magnitude;
}

/**
 * The last-in-file-order, latest-dated row carrying a balance, per resolved
 * account — iterating `payload.transactions` in the order the caller supplied
 * it, not the date-sorted order `writeTransactionsPhase` inserts in.
 */
function closingBalanceCandidates(
  db: FinanceDb,
  rows: readonly ConfirmedTransaction[],
  failedChecksums: ReadonlySet<string>
): Map<string, ClosingBalanceCandidate> {
  const byAccount = new Map<string, ClosingBalanceCandidate>();
  for (const row of rows) {
    if (row.balanceCents === undefined) continue;
    if (failedChecksums.has(row.checksum)) continue;

    const accountId = resolveImportAccountId(db, row.dialectAccountLabel, row.accountId);
    const existing = byAccount.get(accountId);
    if (existing !== undefined && row.date < existing.date) continue;

    byAccount.set(accountId, {
      accountId,
      date: row.date,
      balanceCents: row.balanceCents,
      balanceMarker: row.balanceMarker,
    });
  }
  return byAccount;
}

/** One candidate row, minted and measured — or skipped when it is already recorded. */
function mintOne(
  tx: FinanceDb,
  candidate: ClosingBalanceCandidate,
  commitKey: string | undefined
): { checkpoint: CommitCheckpoint; warning?: ImportWarning } | undefined {
  const account = accountsService.getAccount(tx, candidate.accountId);
  const behaviour = getAccountKindBehaviour(account.kind);
  const balanceCents = signStatementBalance(
    candidate.balanceCents,
    candidate.balanceMarker,
    behaviour.signConvention
  );

  let row;
  try {
    row = accountCheckpointsService.insertCheckpoint(tx, {
      accountId: candidate.accountId,
      balanceCents,
      asOf: candidate.date,
      source: 'import',
      sourceRef: commitKey ?? null,
      note: `${account.name} statement closing balance`,
    });
  } catch (error) {
    if (isCheckpointConflict(error)) return undefined;
    throw error;
  }

  return measure(tx, row, account, {
    what: `${account.name}'s statement closing balance`,
    sayer: 'statement',
  });
}

/** The minted row's agreement with the ledger, and the warning when there is none. */
type MintedRow = ReturnType<typeof accountCheckpointsService.insertCheckpoint>;

function measure(
  tx: FinanceDb,
  row: MintedRow,
  account: { currency: string },
  words: { what: string; sayer: string }
): { checkpoint: CommitCheckpoint; warning?: ImportWarning } {
  const checkpoint = {
    id: row.id,
    accountId: row.accountId,
    balanceCents: row.balanceCents,
    currency: account.currency,
    asOf: row.asOf,
  };
  const delta = checkpointDelta(tx, row);
  if (delta === null || delta.deltaCents === 0)
    return { checkpoint: { ...checkpoint, deltaCents: 0 } };
  return {
    checkpoint: { ...checkpoint, deltaCents: delta.deltaCents },
    warning: {
      type: 'CHECKPOINT_MISMATCH',
      message: `Ledger disagrees with ${words.what}`,
      affectedCount: 1,
      details: `expected ${delta.expectedBalanceCents}c, ${words.sayer} says ${row.balanceCents}c (Δ ${delta.deltaCents}c)`,
    },
  };
}

export interface ReportedBalance {
  accountId: string;
  /** Already ledger-signed: a provider reports the account's balance, not a statement column. */
  balanceCents: number;
  /** The date of the newest row the balance was reported with. */
  asOf: string;
}

/**
 * Mint the checkpoint a live draft carried (finance ADR-005, POPS-3335): the
 * balance Up reported with its newest row, dated to that row, once the rows
 * are in the ledger. Skipped when that account and day already have one.
 */
export function mintReportedBalanceCheckpoint(
  tx: FinanceDb,
  reported: ReportedBalance,
  commitKey: string | undefined
): { checkpoint: CommitCheckpoint; warning?: ImportWarning } | undefined {
  const account = accountsService.getAccount(tx, reported.accountId);
  let row;
  try {
    row = accountCheckpointsService.insertCheckpoint(tx, {
      accountId: reported.accountId,
      balanceCents: reported.balanceCents,
      asOf: reported.asOf,
      source: 'import',
      sourceRef: commitKey ?? null,
      note: `${account.name} balance from the Up API`,
    });
  } catch (error) {
    if (isCheckpointConflict(error)) return undefined;
    throw error;
  }
  return measure(tx, row, account, { what: `${account.name}'s Up balance`, sayer: 'Up' });
}

/**
 * Mint an import checkpoint from this commit's closing balance, if the
 * payload carries one, inside the caller's SQLite transaction.
 *
 * Called after `pairTransfersPhase` and before `recordCommit` so a replayed
 * `commitKey` never doubles a checkpoint (the commit-level pre-flight is the
 * first guard, the partial-unique index the second).
 */
export function mintImportCheckpointsPhase(
  tx: FinanceDb,
  transactions: readonly ConfirmedTransaction[],
  failedChecksums: ReadonlySet<string>,
  commitKey: string | undefined
): ImportCheckpointResult {
  const candidates = closingBalanceCandidates(tx, transactions, failedChecksums);
  const result: ImportCheckpointResult = { checkpoints: [], warnings: [] };

  for (const candidate of candidates.values()) {
    const minted = mintOne(tx, candidate, commitKey);
    if (minted === undefined) continue;
    result.checkpoints.push(minted.checkpoint);
    if (minted.warning) result.warnings.push(minted.warning);
  }

  return result;
}
