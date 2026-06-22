/**
 * Atomic import commit: apply correction + tag-rule ChangeSets, write
 * transactions, and retroactively re-classify existing rows — all inside one
 * SQLite transaction so a failure anywhere rolls the lot back.
 *
 * Pending contacts are pre-created against the contacts pillar BEFORE the
 * SQLite transaction opens (network can't live inside a better-sqlite3 sync
 * transaction). Each pre-create carries `{ name, type }` and is idempotent —
 * a 409 dup-name fetches the existing contact id so a retry after a rolled-back
 * finance tx reuses the contact (PRD-163 OD-8/S1). The resolved tempId→id map
 * is threaded into the synchronous transaction.
 *
 * Ported from the monolith `lib/transaction-persistence.ts` (the commit half).
 * Db-injected: the outer `db.transaction` handle (`tx`) is threaded into every
 * inner service so the correction/tag-rule ChangeSet applies nest as savepoints
 * rather than opening independent transactions.
 */
import { type FinanceDb, importsService, tagVocabularyService } from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { applyChangeSet } from '../corrections/index.js';
import { applyTagRuleChangeSet } from '../tag-rules/service.js';
import {
  collectTagsFromTagRuleChangeSet,
  resolveChangeSetTempIds,
  resolveTagRuleChangeSetTempIds,
} from './commit-temp-resolver.js';
import { COMMIT_TEMP_ENTITY_PREFIX, validateCommitPayload } from './commit-validation.js';
import { reclassifyExistingTransactions } from './reclassify-existing.js';

import type { CommitPayload, CommitResult, FailedTransactionDetail } from './types.js';

interface RuleApplyCounts {
  add: number;
  edit: number;
  disable: number;
  remove: number;
}

/**
 * Pre-create every pending contact against the contacts pillar BEFORE the
 * finance transaction opens, returning the tempId→contact-id map. Each create
 * carries `{ name, type }` (preserving the type override the old in-tx
 * `UPDATE entities SET type` performed) and is create-or-fetch-by-name, so a
 * retry after a rolled-back finance tx reuses the existing contact (OD-8).
 * `entitiesCreated` counts ONLY real inserts — a reused (already-existing)
 * contact must not inflate the commit result's "Entities Created" card.
 */
async function preCreatePendingContacts(
  contacts: ContactsClient,
  payload: CommitPayload
): Promise<{ tempIdMap: Map<string, string>; entitiesCreated: number }> {
  const tempIdMap = new Map<string, string>();
  let entitiesCreated = 0;
  for (const pending of payload.entities) {
    const { id, created } = await contacts.createOrFetchByName(pending.name, pending.type);
    tempIdMap.set(pending.tempId, id);
    if (created) entitiesCreated++;
  }
  return { tempIdMap, entitiesCreated };
}

function applyChangeSetsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): RuleApplyCounts {
  const counts: RuleApplyCounts = { add: 0, edit: 0, disable: 0, remove: 0 };
  for (const cs of payload.changeSets) {
    const resolved = resolveChangeSetTempIds(cs, tempIdMap);
    applyChangeSet(tx, resolved);
    for (const op of resolved.ops) counts[op.op]++;
  }
  return counts;
}

function applyTagRuleChangeSetsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): number {
  let tagRulesApplied = 0;
  for (const cs of payload.tagRuleChangeSets) {
    const resolved = resolveTagRuleChangeSetTempIds(cs, tempIdMap);
    for (const tag of collectTagsFromTagRuleChangeSet(resolved)) {
      tagVocabularyService.upsertVocabularyTag(tx, tag, 'user');
    }
    applyTagRuleChangeSet(tx, resolved);
    tagRulesApplied += resolved.ops.length;
  }
  return tagRulesApplied;
}

function deriveTransactionType(
  txnType: string | null | undefined
): 'Transfer' | 'Income' | 'Expense' {
  if (txnType === 'transfer') return 'Transfer';
  if (txnType === 'income') return 'Income';
  return 'Expense';
}

interface WriteTxnsResult {
  imported: number;
  failed: number;
  failedDetails: FailedTransactionDetail[];
}

function resolveTxnEntityId(
  entityId: string | undefined,
  tempIdMap: Map<string, string>
): string | undefined {
  if (entityId?.startsWith(COMMIT_TEMP_ENTITY_PREFIX)) {
    return tempIdMap.get(entityId) ?? entityId;
  }
  return entityId;
}

function writeTransactionsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): WriteTxnsResult {
  let imported = 0;
  let failed = 0;
  const failedDetails: FailedTransactionDetail[] = [];

  for (const txn of payload.transactions) {
    const entityId = resolveTxnEntityId(txn.entityId, tempIdMap);
    try {
      importsService.insertImportTransaction(tx, {
        description: txn.description,
        account: txn.account,
        amount: txn.amount,
        date: txn.date,
        type: deriveTransactionType(txn.transactionType),
        tags: txn.tags ?? [],
        entityId: entityId ?? null,
        entityName: txn.entityName ?? null,
        location: txn.location ?? null,
        rawRow: txn.rawRow,
        checksum: txn.checksum,
      });
      imported++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CommitImport] Transaction write failed: ${errorMessage}`);
      failed++;
      failedDetails.push({ checksum: txn.checksum ?? null, error: errorMessage });
    }
  }

  return { imported, failed, failedDetails };
}

/**
 * Atomically commit an import. Pending contacts are pre-created against the
 * contacts pillar first (network, outside the tx); the resolved tempId→id map
 * then feeds the synchronous SQLite transaction that writes transactions +
 * applies ChangeSets + reclassifies. A pre-create failure (contacts down)
 * throws BEFORE the transaction opens, so nothing is half-committed.
 */
export async function commitImport(
  db: FinanceDb,
  contacts: ContactsClient,
  payload: CommitPayload
): Promise<CommitResult> {
  validateCommitPayload(payload);

  const { tempIdMap, entitiesCreated } = await preCreatePendingContacts(contacts, payload);

  return db.transaction((tx) => {
    const rulesApplied = applyChangeSetsPhase(tx, payload, tempIdMap);
    const tagRulesApplied = applyTagRuleChangeSetsPhase(tx, payload, tempIdMap);
    const writeResult = writeTransactionsPhase(tx, payload, tempIdMap);

    const retroactiveReclassifications = reclassifyExistingTransactions(
      tx,
      payload.transactions.map((t) => t.checksum).filter((c): c is string => c != null)
    );

    return {
      entitiesCreated,
      rulesApplied,
      tagRulesApplied,
      transactionsImported: writeResult.imported,
      transactionsFailed: writeResult.failed,
      failedDetails: writeResult.failedDetails,
      retroactiveReclassifications,
    };
  });
}
