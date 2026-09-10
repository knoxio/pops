/**
 * Batch import of one Up account into the POPS account mapped to it
 * (POPS-30, finance ADR-003).
 *
 * The write half of {@link planUpSync}: run the new rows through the same
 * process → commit pipeline a file import uses, settle the held ones in
 * place, and mint an `import` checkpoint from the account's API balance dated
 * the day of the sync — not the newest row's date, because the balance is
 * what Up says the account holds NOW, and a range that ends last month says
 * nothing about today.
 *
 * A sync that finds nothing new still writes a batch with zero rows: for an
 * API source, "checked, nothing new" is the fact worth recording, and it is
 * what the staleness read (POPS-2917) measures cadence from.
 */
import { accountImportConfigService, type FinanceDb } from '../../../db/index.js';
import { stageMappedRows } from '../import-drafts/live-draft.js';
import { planUpSync, type UpSyncArgs } from './sync-plan.js';
import { settleMappedRows } from './write-rows.js';

import type { ImportWarning } from '../../../contract/rest-imports-schemas.js';
import type { ContactsClient } from '../../contacts/client.js';

export interface UpSyncResult {
  accountId: string;
  fetched: number;
  /** Rows this pass added to the account's pending draft (finance ADR-005). */
  staged: number;
  /** Rows the pending draft already held. */
  alreadyStaged: number;
  /** Rows already in the ledger: fetched, not staged. */
  alreadyInLedger: number;
  settled: number;
  /**
   * Held rows a settlement would have turned into a positive `purchase`
   * (POPS-2685). They keep their pending flag and reappear as `alreadyHeld`
   * next sync; a number that stays above zero across syncs is a row needing a
   * human, not a transient.
   */
  settleRefused: number;
  alreadyHeld: number;
  /** The pending draft the rows wait in; null when nothing was staged and none existed. */
  draftId: string | null;
  warnings: ImportWarning[];
}

/**
 * One pass over an Up account: fetch the range, stage what is new into the
 * account's pending draft, settle held ledger rows in place, and record the
 * pass on the import config. Nothing reaches the ledger here; the balance
 * Up reports rides on the draft and becomes a checkpoint when it is
 * committed (POPS-3335).
 */
export async function syncUpAccount(
  db: FinanceDb,
  contacts: ContactsClient,
  args: UpSyncArgs
): Promise<UpSyncResult> {
  const plan = await planUpSync(db, args);
  const staged = await stageMappedRows({
    db,
    contacts,
    target: { accountId: plan.account.id, accountName: plan.account.name },
    rows: plan.newRows,
    balanceCents: plan.upAccount.attributes.balance.valueInBaseUnits,
  });
  const { settled, refused } = settleMappedRows(db, plan.settleable);
  accountImportConfigService.markSynced(db, plan.account.id, args.syncedAt ?? new Date());

  return {
    accountId: plan.account.id,
    fetched: plan.fetched,
    staged: staged.staged,
    alreadyStaged: staged.alreadyStaged,
    alreadyInLedger: staged.alreadyInLedger,
    settled: settled.length,
    settleRefused: refused.length,
    alreadyHeld: plan.alreadyHeld,
    draftId: staged.draftId === '' ? null : staged.draftId,
    warnings: staged.warnings ?? [],
  };
}
