/**
 * The rows inside a live draft, changed one at a time as Up settles or
 * deletes them (POPS-3333). A draft a tab holds is reported, never written:
 * the person sees it as it was, and the ledger row is settled by the next
 * sync after commit.
 */
import { importDraftsService, type FinanceDb } from '../../../db/index.js';
import {
  countsOf,
  type LiveDraftPayload,
  readLiveDraftPayload,
  stamped,
} from './live-draft-payload.js';

import type { ImportDraftRow } from '../../../db/services/import-drafts.js';
import type { MappedUpTransaction } from '../up-bank/map-transaction.js';

export function heldChecksums(draft: ImportDraftRow): string[] {
  try {
    return readLiveDraftPayload(draft).parsedTransactions.map((t) => t.checksum);
  } catch {
    return [];
  }
}

/** What a settle or a drop did: `unchanged` is a settle that found the row already settled that way. */
export type StagedRowChange = 'changed' | 'unchanged' | 'open' | 'absent';

interface Held {
  draft: ImportDraftRow;
  payload: LiveDraftPayload;
}

/** The account's draft holding `checksum`, whoever started it; a draft with an owner is reported, not read. */
function findHeld(db: FinanceDb, accountId: string, checksum: string): Held | 'open' | undefined {
  for (const draft of importDraftsService.listImportDrafts(db, { accountId })) {
    let payload: LiveDraftPayload;
    try {
      payload = readLiveDraftPayload(draft);
    } catch {
      continue;
    }
    if (!payload.parsedTransactions.some((t) => t.checksum === checksum)) continue;
    return draft.ownerToken === null ? { draft, payload } : 'open';
  }
  return undefined;
}

function rewrite(db: FinanceDb, held: Held, payload: LiveDraftPayload): void {
  const next = stamped(payload);
  if (next.parsedTransactions.length === 0) {
    importDraftsService.discardImportDraft(db, held.draft.id);
    return;
  }
  importDraftsService.writeImportDraft(db, held.draft.id, {
    payload: JSON.stringify(next),
    ...countsOf(next),
  });
}

/**
 * A held row settled: same row, the settled date and amount, flag cleared.
 * Left alone when the draft is open in a wizard; the person sees it as it
 * was and the ledger row is settled by the next sync after commit.
 */
export function settleStagedRow(
  db: FinanceDb,
  accountId: string,
  mapped: MappedUpTransaction
): StagedRowChange {
  const held = findHeld(db, accountId, mapped.parsed.checksum);
  if (held === undefined) return 'absent';
  if (held === 'open') return 'open';
  const current = held.payload.parsedTransactions.find(
    (t) => t.checksum === mapped.parsed.checksum
  );
  if (
    current !== undefined &&
    current.pending !== true &&
    current.date === mapped.parsed.date &&
    current.amount === mapped.parsed.amount
  ) {
    return 'unchanged';
  }
  const settle = <T extends { checksum: string }>(row: T): T =>
    row.checksum === mapped.parsed.checksum
      ? {
          ...row,
          date: mapped.parsed.date,
          amount: mapped.parsed.amount,
          rawRow: mapped.parsed.rawRow,
          pending: false,
        }
      : row;
  const processed = held.payload.processedTransactions;
  rewrite(db, held, {
    ...held.payload,
    parsedTransactions: held.payload.parsedTransactions.map(settle),
    processedTransactions: {
      ...processed,
      matched: processed.matched.map(settle),
      uncertain: processed.uncertain.map(settle),
      failed: processed.failed.map(settle),
    },
  });
  return 'changed';
}

/** A row Up deleted: gone from the draft; the draft itself goes when that was its last row. */
export function dropStagedRow(db: FinanceDb, accountId: string, checksum: string): StagedRowChange {
  const held = findHeld(db, accountId, checksum);
  if (held === undefined) return 'absent';
  if (held === 'open') return 'open';
  const keep = <T extends { checksum: string }>(rows: T[]): T[] =>
    rows.filter((row) => row.checksum !== checksum);
  const processed = held.payload.processedTransactions;
  rewrite(db, held, {
    ...held.payload,
    parsedTransactions: keep(held.payload.parsedTransactions),
    processedTransactions: {
      ...processed,
      matched: keep(processed.matched),
      uncertain: keep(processed.uncertain),
      failed: keep(processed.failed),
    },
    manuallyResolvedChecksums: held.payload.manuallyResolvedChecksums.filter((c) => c !== checksum),
  });
  return 'changed';
}
