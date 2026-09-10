/**
 * Import commit: apply correction + tag-rule ChangeSets, write transactions,
 * and retroactively re-classify existing rows inside one SQLite transaction.
 * A thrown error anywhere in the ChangeSet-apply or reclassification phases
 * rolls the whole SQLite transaction back. Per-transaction inserts are the
 * exception: `writeTransactionsPhase` catches and counts individual insert
 * failures rather than throwing, so one bad row lands in `failedDetails`
 * without rolling back the ChangeSets or the other rows already written.
 *
 * The contacts pre-create phase (network, run before the SQLite transaction
 * opens) lives in `commit-contacts-precreate.ts` — see that file for how a
 * contacts outage degrades to an outbox placeholder instead of aborting
 * (#3683).
 *
 * `applyChangeSetsPhase` runs every correction ChangeSet through
 * `dropUnusableAddOps` before applying it. Two add-op shapes can only ever
 * produce a rule that never fires: a tags-only/entityName-only op (no
 * `entityId`, no `transactionType`, non-empty `tags`), which violates the
 * classification-rule/tag-rule table boundary (CF061/#3650); and a `regex` op
 * whose pattern does not compile (POPS-2600). Either would throw inside
 * `applyAddOp` — inside this commit's single transaction, that throw would
 * roll back every transaction insert and entity creation over one inert rule.
 * The bad op is dropped with a logged warning and the rest of the commit
 * proceeds. `proposeChangeSetFromCorrectionSignal` filters the tags-only
 * shape out before a user can approve it; the uncompilable regex has no such
 * upstream filter, because the correction detail editor pairs a free-text
 * pattern with a `regex` option and validates nothing client-side.
 *
 * The outer `db.transaction` handle (`tx`) is threaded into every inner service
 * so the correction/tag-rule ChangeSet applies nest as savepoints rather than
 * opening independent transactions.
 *
 * Which tags a commit may add to `tag_vocabulary` is decided by
 * `planCommitTagVocabulary` before the transaction opens (and before contacts
 * pre-create, which the transaction does not cover), so a payload naming a
 * value a closed namespace does not hold is refused with a 400 having written
 * nothing at all. The same call also filters each staged tag rule's tags down
 * to what `acceptedNewTags` allows (POPS-2643) — `applyTagRuleChangeSetsPhase`
 * applies that filtered set, not `payload.tagRuleChangeSets` directly, so a
 * declined tag reaches neither the rule nor the vocabulary. The upsert plan is
 * applied as the transaction's first phase, ahead of the transaction writes
 * whose `incrementVocabularyUsage` must find those rows already present.
 *
 * It runs AFTER the `commitKey` pre-flight below, not before it. The plan
 * validates against the vocabulary as it stands now, so validating a resubmit
 * would let a vocabulary that has moved on since — a tag deactivated, a
 * namespace tightened — turn an already-succeeded commit into a 400 on replay.
 * A recorded result is returned on its own terms; nothing about the payload is
 * re-judged (POPS-2602).
 *
 * `payload.commitKey` (issues #3640/#3642), when supplied, makes a resubmit
 * of the same commit a no-op: a pre-flight check returns the first call's
 * recorded result immediately (before contacts pre-create runs again), and
 * the SQLite transaction records the result under that key on success. A
 * race between two in-flight calls sharing a key is resolved by the key's
 * UNIQUE constraint — the loser's transaction rolls back (nothing it wrote
 * survives) and `commitImport` returns the winner's already-recorded result
 * instead of surfacing the constraint error.
 */
import { CommitResultSchema } from '../../../contract/rest-imports-schemas.js';
import {
  type FinanceDb,
  importCommitsService,
  importDraftsService,
  importsService,
  tagVocabularyService,
} from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { recordImportBatchesPhase, type InsertedTransaction } from './commit-batches.js';
import { applyChangeSetsPhase, applyTagRuleChangeSetsPhase } from './commit-changesets.js';
import { mintImportCheckpointsPhase } from './commit-checkpoint.js';
import { transactionColumns } from './commit-columns.js';
import {
  enqueueOutboxCandidatesPhase,
  preCreatePendingContacts,
} from './commit-contacts-precreate.js';
import {
  batchSourceFor,
  commitLiveDraftPhase,
  type LiveDraftContext,
  liveDraftOf,
} from './commit-live-draft.js';
import { expandLoanRepaymentRow } from './commit-loan-split.js';
import { pairTransfersPhase } from './commit-pair-transfers.js';
import { applyCommitTagVocabulary, planCommitTagVocabulary } from './commit-tag-vocabulary.js';
import {
  assertPersistableEntityId,
  COMMIT_TEMP_ENTITY_PREFIX,
  validateCommitPayload,
} from './commit-validation.js';
import { reclassifyExistingTransactions } from './reclassify-existing.js';

import type {
  CommitBatch,
  CommitPayload,
  CommitResult,
  FailedTransactionDetail,
  ImportWarning,
} from './types.js';

/** The previously recorded result for `commitKey`, re-validated against the
 * wire contract, or `undefined` if this key has never been committed. */
function readCommittedResult(db: FinanceDb, commitKey: string): CommitResult | undefined {
  const json = importCommitsService.findCommittedResultJson(db, commitKey);
  return json === undefined ? undefined : CommitResultSchema.parse(json);
}

interface WriteTxnsResult {
  imported: number;
  failed: number;
  failedDetails: FailedTransactionDetail[];
  /** The rows successfully inserted this commit, for the pairing and batch phases. */
  inserted: InsertedTransaction[];
}

function resolveTxnEntityId(
  entityId: string | undefined,
  tempIdMap: Map<string, string>
): string | undefined {
  if (entityId == null) return undefined;
  const resolved = entityId.startsWith(COMMIT_TEMP_ENTITY_PREFIX)
    ? tempIdMap.get(entityId)
    : entityId;
  assertPersistableEntityId(entityId, resolved);
  return resolved;
}

function writeTransactionsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): WriteTxnsResult {
  let imported = 0;
  let failed = 0;
  const failedDetails: FailedTransactionDetail[] = [];
  const inserted: InsertedTransaction[] = [];

  // The loan split (`expandLoanRepaymentRow`) computes each repayment's
  // interest leg from `balanceAsOf` the day before it, which only sees rows
  // already inserted earlier in this loop. A batch is not guaranteed to arrive in
  // date order — a bank statement exported newest-first is a common CSV
  // layout — so an out-of-order batch would let a later-processed-but-
  // earlier-dated repayment be missing from an earlier-processed-but-later-
  // dated repayment's balance lookup, understating the balance the interest
  // is computed against. Sorting the whole batch chronologically before the
  // insert loop fixes that for every account at once; nothing downstream of
  // this loop (dedup-checksum collection, transfer pairing) depends on the
  // original payload order.
  const orderedTransactions = payload.transactions.toSorted((a, b) => a.date.localeCompare(b.date));

  for (const txn of orderedTransactions) {
    const entityId = resolveTxnEntityId(txn.entityId, tempIdMap);
    try {
      // A loan repayment expands to its interest + principal legs here
      // (POPS-2830); every other row is its own single-element array, so the
      // insert loop below doesn't need to know the split happened at all.
      const rows = expandLoanRepaymentRow(tx, transactionColumns(txn, entityId));
      for (const columns of rows) {
        const row = importsService.insertImportTransaction(tx, columns);
        imported++;
        inserted.push({
          id: row.id,
          accountId: row.accountId,
          date: row.date,
          carriesBalance: txn.balanceCents !== undefined,
        });
      }
      tagVocabularyService.incrementVocabularyUsage(tx, txn.tags ?? []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CommitImport] Transaction write failed: ${errorMessage}`);
      failed++;
      failedDetails.push({ checksum: txn.checksum ?? null, error: errorMessage });
    }
  }

  return { imported, failed, failedDetails, inserted };
}

/**
 * The phases that read back what the write phase did: pair the rows just
 * written, mint checkpoints from any closing balance the file carried, and
 * record one batch per account. All three run after every row has landed and
 * before `recordCommit`, so a replayed key returns them rather than redoing
 * them.
 */
function recordOutcomePhases(
  tx: FinanceDb,
  payload: CommitPayload,
  writeResult: WriteTxnsResult,
  liveDraft: LiveDraftContext | undefined
): { checkpoints: CommitResult['checkpoints']; warnings: ImportWarning[]; batches: CommitBatch[] } {
  pairTransfersPhase(
    tx,
    writeResult.inserted.map((row) => row.id)
  );

  const failedChecksums = new Set(
    writeResult.failedDetails.map((d) => d.checksum).filter((c): c is string => c !== null)
  );
  const { checkpoints, warnings } = mintImportCheckpointsPhase(
    tx,
    payload.transactions,
    failedChecksums,
    payload.commitKey
  );

  commitLiveDraftPhase(tx, {
    liveDraft,
    inserted: writeResult.inserted,
    commitKey: payload.commitKey,
    checkpoints,
    warnings,
  });

  const batches = recordImportBatchesPhase(tx, {
    inserted: writeResult.inserted,
    source: batchSourceFor(liveDraft, payload.source),
    checkpoints,
    commitKey: payload.commitKey,
  });

  return { checkpoints, warnings, batches };
}

/**
 * Commit an import. Pending contacts are pre-created against the contacts
 * pillar first (network, outside the tx); the resolved tempId→id map then
 * feeds the synchronous SQLite transaction that applies ChangeSets, writes
 * transactions, and reclassifies. A pre-create failure that ISN'T a contacts
 * outage (see `preCreatePendingContacts`) still throws BEFORE the SQLite
 * transaction opens, so no finance-side row is written for that attempt —
 * but pre-created contacts themselves are not part of that transaction and
 * are not rolled back if a later phase fails. An outage instead queues an
 * outbox row (inside the tx) and the commit proceeds with a pending
 * placeholder.
 */
export async function commitImport(
  db: FinanceDb,
  contacts: ContactsClient,
  payload: CommitPayload
): Promise<CommitResult> {
  validateCommitPayload(payload);

  const { commitKey } = payload;
  if (commitKey) {
    const alreadyCommitted = readCommittedResult(db, commitKey);
    if (alreadyCommitted) return alreadyCommitted;
  }

  const tagPlan = planCommitTagVocabulary(db, payload);
  const liveDraft = liveDraftOf(db, payload.draftId);

  const { tempIdMap, entitiesCreated, outboxCandidates } = await preCreatePendingContacts(
    contacts,
    payload
  );

  try {
    return db.transaction((tx) => {
      enqueueOutboxCandidatesPhase(tx, outboxCandidates);
      applyCommitTagVocabulary(tx, tagPlan);
      const correctionPhase = applyChangeSetsPhase(tx, payload, tempIdMap);
      const tagRulePhase = applyTagRuleChangeSetsPhase(tx, tagPlan.tagRuleChangeSets, tempIdMap);
      const writeResult = writeTransactionsPhase(tx, payload, tempIdMap);

      const retroactiveReclassifications = reclassifyExistingTransactions(
        tx,
        payload.transactions.map((t) => t.checksum).filter((c): c is string => c != null)
      );

      const { checkpoints, warnings, batches } = recordOutcomePhases(
        tx,
        payload,
        writeResult,
        liveDraft
      );

      const result: CommitResult = {
        entitiesCreated,
        rulesApplied: correctionPhase.counts,
        correctionRuleWrites: correctionPhase.writes,
        tagRulesApplied: tagRulePhase.applied,
        tagRuleWrites: tagRulePhase.writes,
        transactionsImported: writeResult.imported,
        transactionsFailed: writeResult.failed,
        failedDetails: writeResult.failedDetails,
        retroactiveReclassifications,
        ...(warnings.length > 0 ? { warnings } : {}),
        checkpoints,
        batches,
      };

      if (commitKey) importCommitsService.recordCommit(tx, commitKey, result);
      if (payload.draftId) importDraftsService.discardImportDraft(tx, payload.draftId);
      return result;
    });
  } catch (error) {
    if (commitKey && importCommitsService.isImportCommitUniqueViolation(error)) {
      const raced = readCommittedResult(db, commitKey);
      if (raced) return raced;
    }
    throw error;
  }
}
