/**
 * The live draft: where an account's rows from a provider wait for review
 * (POPS-3333, finance ADR-005). Nothing from Up reaches the ledger without
 * a person committing it; everything the webhook and the sync fetch is
 * staged here, classified on arrival through the same ladder the wizard's
 * Process step runs, so the card can say how many rows still need a decision.
 *
 * One rule spans this file and the ingest: a draft a person holds is never
 * written to. `liveDraftFor` only returns the collecting draft (claiming
 * turns it `saved`), and a settle or a drop skips a draft with an owner.
 * The payload's shape lives in `live-draft-payload.ts`; the per-row settle
 * and drop in `live-draft-rows.ts`.
 */
import { importDraftsService, type FinanceDb } from '../../../db/index.js';
import { processImportCore } from '../imports/process-service.js';
import {
  countsOf,
  emptyLiveDraftPayload,
  type LiveDraftPayload,
  type LiveDraftTarget,
  readLiveDraftPayload,
  stamped,
} from './live-draft-payload.js';
import { heldChecksums } from './live-draft-rows.js';

import type { ProcessedTransaction } from '../../../contract/rest-imports-schemas.js';
import type { ImportDraftRow } from '../../../db/services/import-drafts.js';
import type { ContactsClient } from '../../contacts/client.js';
import type { MappedUpTransaction } from '../up-bank/map-transaction.js';

export {
  countsOf,
  emptyLiveDraftPayload,
  fingerprintOf,
  type LiveDraftPayload,
  LiveDraftPayloadSchema,
  type LiveDraftTarget,
  readLiveDraftPayload,
} from './live-draft-payload.js';
export { dropStagedRow, settleStagedRow, type StagedRowChange } from './live-draft-rows.js';

export interface StagedRows {
  draftId: string;
  /** Rows added to the draft by this call. */
  staged: number;
  /** Rows the draft already held. */
  alreadyStaged: number;
  /** Rows already in the ledger; never staged. */
  alreadyInLedger: number;
  /** True when this call created the draft. */
  created: boolean;
  warnings: LiveDraftPayload['processedTransactions']['warnings'];
}

interface LiveDraftWrite {
  existing: ImportDraftRow | undefined;
  target: LiveDraftTarget;
  payload: LiveDraftPayload;
  balanceCents: number | null;
}

function writeLiveDraft(
  db: FinanceDb,
  { existing, target, payload, balanceCents }: LiveDraftWrite
): ImportDraftRow {
  const counts = countsOf(payload);
  const body = { payload: JSON.stringify(payload), ...counts };
  if (existing === undefined) {
    return importDraftsService.createImportDraft(db, {
      ...body,
      accountId: target.accountId,
      sourceKind: 'live',
      state: 'live',
      provider: 'up',
      balanceReportedCents: balanceCents,
    });
  }
  return importDraftsService.writeImportDraft(db, existing.id, {
    ...body,
    ...(balanceCents === null ? {} : { balanceReportedCents: balanceCents }),
  });
}

export interface StageInput {
  db: FinanceDb;
  contacts: ContactsClient;
  target: LiveDraftTarget;
  rows: readonly MappedUpTransaction[];
  /** The balance the provider reported with these rows; null keeps what the draft had. */
  balanceCents: number | null;
}

interface Classified {
  payload: LiveDraftPayload;
  alreadyInLedger: number;
}

/** Run the new rows through the ladder and merge what survived the ledger dedup into the payload. */
async function classifyInto(
  input: Pick<StageInput, 'db' | 'contacts' | 'target'>,
  payload: LiveDraftPayload,
  fresh: readonly MappedUpTransaction[],
  batchId: string
): Promise<Classified> {
  const mappedType = new Map(fresh.map((row) => [row.parsed.checksum, row.transactionType]));
  const { output } = await processImportCore({
    db: input.db,
    contacts: input.contacts,
    transactions: fresh.map((row) => row.parsed),
    importBatchId: batchId,
  });
  const assertType = (row: ProcessedTransaction): ProcessedTransaction => ({
    ...row,
    transactionType: mappedType.get(row.checksum) ?? row.transactionType,
  });
  const arrived = new Set(
    [...output.matched, ...output.uncertain, ...output.failed].map((row) => row.checksum)
  );
  const warnings = [...(payload.processedTransactions.warnings ?? []), ...(output.warnings ?? [])];
  const previous = payload.processedTransactions;
  return {
    alreadyInLedger: output.skipped.length,
    payload: stamped({
      ...payload,
      parsedTransactions: [
        ...payload.parsedTransactions,
        ...fresh.map((row) => row.parsed).filter((row) => arrived.has(row.checksum)),
      ],
      processedTransactions: {
        matched: [...previous.matched, ...output.matched.map(assertType)],
        uncertain: [...previous.uncertain, ...output.uncertain.map(assertType)],
        failed: [...previous.failed, ...output.failed.map(assertType)],
        skipped: previous.skipped,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    }),
  };
}

/**
 * Stage rows into the account's collecting draft, creating it when there is
 * none, classifying the new ones on arrival. Rows any draft of the account
 * already holds and rows already in the ledger are counted and left alone:
 * a row a person has open in a saved draft must not arrive a second time in
 * the next one.
 */
export async function stageMappedRows(input: StageInput): Promise<StagedRows> {
  const { db, target, rows, balanceCents } = input;
  const existing = importDraftsService.liveDraftFor(db, target.accountId);
  const payload =
    existing === undefined ? emptyLiveDraftPayload(target) : readLiveDraftPayload(existing);
  const held = new Set(
    importDraftsService
      .listImportDrafts(db, { accountId: target.accountId })
      .flatMap((draft) => heldChecksums(draft))
  );
  const fresh = rows.filter((row) => !held.has(row.parsed.checksum));
  const alreadyStaged = rows.length - fresh.length;
  const classified =
    fresh.length === 0
      ? { payload, alreadyInLedger: 0 }
      : await classifyInto(input, payload, fresh, existing?.id ?? `live:${target.accountId}`);
  const staged = classified.payload.parsedTransactions.length - payload.parsedTransactions.length;
  const nothingToWrite = staged === 0 && (existing === undefined || balanceCents === null);
  if (nothingToWrite) {
    return {
      draftId: existing?.id ?? '',
      staged,
      alreadyStaged,
      alreadyInLedger: classified.alreadyInLedger,
      created: false,
      warnings: undefined,
    };
  }
  const row = writeLiveDraft(db, { existing, target, payload: classified.payload, balanceCents });
  return {
    draftId: row.id,
    staged,
    alreadyStaged,
    alreadyInLedger: classified.alreadyInLedger,
    created: existing === undefined,
    warnings: classified.payload.processedTransactions.warnings,
  };
}
