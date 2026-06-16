/**
 * Atomic import commit: create pending entities, apply correction + tag-rule
 * ChangeSets, write transactions, and retroactively re-classify existing rows —
 * all inside one SQLite transaction so a failure anywhere rolls the lot back.
 *
 * Ported from the monolith `lib/transaction-persistence.ts` (the commit half).
 * Db-injected: the outer `db.transaction` handle (`tx`) is threaded into every
 * inner service so the correction/tag-rule ChangeSet applies nest as savepoints
 * rather than opening independent transactions.
 */
import { eq } from 'drizzle-orm';

import {
  type FinanceDb,
  entities,
  importsService,
  tagVocabularyService,
} from '../../../db/index.js';
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

function createEntitiesPhase(
  tx: FinanceDb,
  payload: CommitPayload
): { tempIdMap: Map<string, string>; entitiesCreated: number } {
  const tempIdMap = new Map<string, string>();
  let entitiesCreated = 0;
  for (const pending of payload.entities) {
    const { entityId } = importsService.createImportEntity(tx, pending.name);
    tempIdMap.set(pending.tempId, entityId);
    entitiesCreated++;
    if (pending.type !== 'company') {
      tx.update(entities).set({ type: pending.type }).where(eq(entities.id, entityId)).run();
    }
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

/** Atomically commit an import inside a single SQLite transaction. */
export function commitImport(db: FinanceDb, payload: CommitPayload): CommitResult {
  validateCommitPayload(payload);

  return db.transaction((tx) => {
    const { tempIdMap, entitiesCreated } = createEntitiesPhase(tx, payload);
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
