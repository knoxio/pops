import { eq } from 'drizzle-orm';

import { entities, transactions } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { logger } from '../../../../lib/logger.js';
import { applyChangeSet } from '../../../core/corrections/service.js';
import { applyTagRuleChangeSet, upsertVocabularyTag } from '../../../core/tag-rules/service.js';
import {
  collectTagsFromTagRuleChangeSet,
  resolveChangeSetTempIds,
  resolveTagRuleChangeSetTempIds,
} from './commit-temp-resolver.js';
import { COMMIT_TEMP_ENTITY_PREFIX, validateCommitPayload } from './commit-validation.js';
import { reclassifyExistingTransactions } from './reclassify-existing.js';

import type { TransactionRow } from '../../transactions/types.js';
import type { CommitPayload, CommitResult, FailedTransactionDetail } from '../types.js';

/** Insert a transaction directly into SQLite. Returns the created row. */
export function insertTransaction(input: {
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  rawRow?: string;
  checksum?: string;
}): TransactionRow {
  const db = getDrizzle();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      account: input.account,
      amount: input.amount,
      date: input.date,
      type: input.type || '',
      tags: JSON.stringify(input.tags),
      entityId: input.entityId,
      entityName: input.entityName,
      location: input.location,
      checksum: input.checksum ?? null,
      rawRow: input.rawRow ?? null,
      lastEditedTime: now,
    })
    .run();

  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new Error(`Insert succeeded but row not found: ${id}`);
  return row;
}

function createEntityInternal(name: string): { entityId: string; entityName: string } {
  const db = getDrizzle();
  const entityId = crypto.randomUUID();

  db.insert(entities)
    .values({ id: entityId, name, lastEditedTime: new Date().toISOString() })
    .run();

  return { entityId, entityName: name };
}

interface RuleApplyCounts {
  add: number;
  edit: number;
  disable: number;
  remove: number;
}

function createEntitiesPhase(payload: CommitPayload): {
  tempIdMap: Map<string, string>;
  entitiesCreated: number;
} {
  const db = getDrizzle();
  const tempIdMap = new Map<string, string>();
  let entitiesCreated = 0;
  for (const pending of payload.entities) {
    const { entityId } = createEntityInternal(pending.name);
    tempIdMap.set(pending.tempId, entityId);
    entitiesCreated++;
    if (pending.type !== 'company') {
      db.update(entities).set({ type: pending.type }).where(eq(entities.id, entityId)).run();
    }
  }
  return { tempIdMap, entitiesCreated };
}

function applyChangeSetsPhase(
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): RuleApplyCounts {
  const counts: RuleApplyCounts = { add: 0, edit: 0, disable: 0, remove: 0 };
  for (const cs of payload.changeSets) {
    const resolved = resolveChangeSetTempIds(cs, tempIdMap);
    applyChangeSet(resolved);
    for (const op of resolved.ops) counts[op.op]++;
  }
  return counts;
}

function applyTagRuleChangeSetsPhase(
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): number {
  let tagRulesApplied = 0;
  for (const cs of payload.tagRuleChangeSets) {
    const resolved = resolveTagRuleChangeSetTempIds(cs, tempIdMap);
    for (const tag of collectTagsFromTagRuleChangeSet(resolved)) {
      upsertVocabularyTag(tag, 'user');
    }
    applyTagRuleChangeSet(resolved);
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

function writeTransactionsPhase(
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): WriteTxnsResult {
  let imported = 0;
  let failed = 0;
  const failedDetails: FailedTransactionDetail[] = [];

  for (const txn of payload.transactions) {
    const entityId = txn.entityId?.startsWith(COMMIT_TEMP_ENTITY_PREFIX)
      ? (tempIdMap.get(txn.entityId) ?? txn.entityId)
      : txn.entityId;

    try {
      insertTransaction({
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
      logger.error(
        { description: txn.description.slice(0, 50), error: errorMessage },
        '[CommitImport] Transaction write failed'
      );
      failed++;
      failedDetails.push({ checksum: txn.checksum ?? null, error: errorMessage });
    }
  }

  return { imported, failed, failedDetails };
}

/**
 * Atomically commit an import: create entities, apply rule changeSets,
 * and write transactions inside a single SQLite transaction.
 */
export function commitImport(payload: CommitPayload): CommitResult {
  validateCommitPayload(payload);
  const db = getDrizzle();

  return db.transaction(() => {
    const { tempIdMap, entitiesCreated } = createEntitiesPhase(payload);
    const rulesApplied = applyChangeSetsPhase(payload, tempIdMap);
    const tagRulesApplied = applyTagRuleChangeSetsPhase(payload, tempIdMap);
    const writeResult = writeTransactionsPhase(payload, tempIdMap);

    const retroactiveReclassifications = reclassifyExistingTransactions(
      db,
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
