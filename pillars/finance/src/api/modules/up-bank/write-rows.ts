/**
 * The write half shared by the batch sync (POPS-30) and the webhook ingest
 * (POPS-2920): new rows go through the unattended commit pipeline, held rows
 * Up has since settled are updated in place. Both callers dedupe on the same
 * checksum before getting here, so a row that reaches `importMappedRows` is
 * one the ledger does not have.
 */
import { importsService, PositiveAmountPurchaseError, type FinanceDb } from '../../../db/index.js';

import type { SettleableRow } from './sync-plan.js';

export function settleMappedRows(
  db: FinanceDb,
  settleable: readonly SettleableRow[]
): { settled: string[]; refused: string[] } {
  const settled: string[] = [];
  const refused: string[] = [];
  for (const { transactionId, mapped } of settleable) {
    try {
      importsService.settleImportedTransaction(db, transactionId, {
        date: mapped.parsed.date,
        amountCents: Math.round(mapped.parsed.amount * 100),
        rawRow: mapped.parsed.rawRow,
      });
      settled.push(transactionId);
    } catch (err) {
      if (!(err instanceof PositiveAmountPurchaseError)) throw err;
      refused.push(transactionId);
    }
  }
  return { settled, refused };
}
