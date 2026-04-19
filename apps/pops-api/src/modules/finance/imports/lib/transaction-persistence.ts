import { asc, eq, notInArray } from 'drizzle-orm';

import { entities, transactionCorrections, transactions } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { logger } from '../../../../lib/logger.js';
import { ValidationError } from '../../../../shared/errors.js';
import { findMatchingCorrectionFromRules } from '../../../core/corrections/service.js';
import { applyChangeSet } from '../../../core/corrections/service.js';
import { applyTagRuleChangeSet, upsertVocabularyTag } from '../../../core/tag-rules/service.js';

import type { TagRuleChangeSet } from '../../../core/tag-rules/types.js';
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

// ---------------------------------------------------------------------------
// Commit import (PRD-031 US-03) — atomic write of entities + rules + transactions
// ---------------------------------------------------------------------------

const TEMP_ENTITY_PREFIX = 'temp:entity:';

/**
 * Validate a commit payload before executing the transaction.
 * Checks that all temp ID references in changeSets and transactions
 * can be resolved against the provided pending entities.
 */
function validateCommitPayload(payload: CommitPayload): void {
  const tempIds = new Set(payload.entities.map((e) => e.tempId));

  // Check for duplicate temp IDs
  if (tempIds.size !== payload.entities.length) {
    throw new ValidationError('Duplicate temp IDs in entities array');
  }

  // Check for duplicate entity names (case-insensitive)
  const names = new Set<string>();
  for (const entity of payload.entities) {
    const lower = entity.name.toLowerCase();
    if (names.has(lower)) {
      throw new ValidationError(`Duplicate entity name: '${entity.name}'`);
    }
    names.add(lower);
  }

  // Collect all temp entity ID references in changeSets and transactions
  const referencedTempIds = new Set<string>();

  for (const cs of payload.changeSets) {
    for (const op of cs.ops) {
      if (op.op === 'add' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        referencedTempIds.add(op.data.entityId);
      }
      if (op.op === 'edit' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        referencedTempIds.add(op.data.entityId);
      }
    }
  }

  for (const cs of payload.tagRuleChangeSets) {
    for (const op of cs.ops) {
      if (op.op === 'add' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        referencedTempIds.add(op.data.entityId);
      }
      if (op.op === 'edit' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        referencedTempIds.add(op.data.entityId);
      }
    }
  }

  for (const txn of payload.transactions) {
    if (txn.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
      referencedTempIds.add(txn.entityId);
    }
  }

  // Verify all referenced temp IDs exist in the entities array
  for (const ref of referencedTempIds) {
    if (!tempIds.has(ref)) {
      throw new ValidationError(`Unknown temp ID referenced: '${ref}'`);
    }
  }
}

/**
 * Replace temp entity IDs with real DB IDs in a ChangeSet's ops (returns a new ChangeSet).
 */
function resolveChangeSetTempIds(
  cs: CommitPayload['changeSets'][number],
  tempIdMap: Map<string, string>
): CommitPayload['changeSets'][number] {
  return {
    ...cs,
    ops: cs.ops.map((op) => {
      if (op.op === 'add' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        const realId = tempIdMap.get(op.data.entityId);
        return { ...op, data: { ...op.data, entityId: realId ?? op.data.entityId } };
      }
      if (op.op === 'edit' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        const realId = tempIdMap.get(op.data.entityId);
        return { ...op, data: { ...op.data, entityId: realId ?? op.data.entityId } };
      }
      return op;
    }),
  };
}

function resolveTagRuleChangeSetTempIds(
  cs: TagRuleChangeSet,
  tempIdMap: Map<string, string>
): TagRuleChangeSet {
  return {
    ...cs,
    ops: cs.ops.map((op) => {
      if (op.op === 'add' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        const realId = tempIdMap.get(op.data.entityId);
        return { ...op, data: { ...op.data, entityId: realId ?? op.data.entityId } };
      }
      if (op.op === 'edit' && op.data.entityId?.startsWith(TEMP_ENTITY_PREFIX)) {
        const realId = tempIdMap.get(op.data.entityId);
        return { ...op, data: { ...op.data, entityId: realId ?? op.data.entityId } };
      }
      return op;
    }),
  };
}

function collectTagsFromTagRuleChangeSet(cs: TagRuleChangeSet): string[] {
  const tags = new Set<string>();
  for (const op of cs.ops) {
    if (op.op === 'add' && op.data.tags) {
      for (const t of op.data.tags) {
        const s = t.trim();
        if (s) tags.add(s);
      }
    }
  }
  return [...tags];
}

/**
 * Create a new entity in SQLite.
 * Returns the generated id and name.
 */
function createEntityInternal(name: string): { entityId: string; entityName: string } {
  const db = getDrizzle();
  const entityId = crypto.randomUUID();

  db.insert(entities)
    .values({
      id: entityId,
      name,
      lastEditedTime: new Date().toISOString(),
    })
    .run();

  return { entityId, entityName: name };
}

/**
 * Atomically commit an import: create entities, apply rule changeSets,
 * and write transactions inside a single SQLite transaction.
 */
export function commitImport(payload: CommitPayload): CommitResult {
  // Validate before starting the transaction
  validateCommitPayload(payload);

  const db = getDrizzle();

  return db.transaction(() => {
    // Phase 1: Create entities, build tempId -> realId map
    const tempIdMap = new Map<string, string>();
    let entitiesCreated = 0;

    for (const pending of payload.entities) {
      const { entityId } = createEntityInternal(pending.name);
      tempIdMap.set(pending.tempId, entityId);
      entitiesCreated++;

      // Update entity type if not default
      if (pending.type !== 'company') {
        db.update(entities).set({ type: pending.type }).where(eq(entities.id, entityId)).run();
      }
    }

    // Phase 2: Apply changeSets with resolved temp IDs
    const rulesApplied = { add: 0, edit: 0, disable: 0, remove: 0 };

    for (const cs of payload.changeSets) {
      const resolved = resolveChangeSetTempIds(cs, tempIdMap);
      applyChangeSet(resolved);

      // Count ops by type
      for (const op of resolved.ops) {
        rulesApplied[op.op]++;
      }
    }

    // Phase 2b: Apply pending tag-rule ChangeSets (PRD-029) with resolved temp IDs
    let tagRulesApplied = 0;
    for (const cs of payload.tagRuleChangeSets) {
      const resolved = resolveTagRuleChangeSetTempIds(cs, tempIdMap);
      for (const tag of collectTagsFromTagRuleChangeSet(resolved)) {
        upsertVocabularyTag(tag, 'user');
      }
      applyTagRuleChangeSet(resolved);
      tagRulesApplied += resolved.ops.length;
    }

    // Phase 3: Write transactions with resolved temp IDs
    let transactionsImported = 0;
    let transactionsFailed = 0;
    const failedDetails: FailedTransactionDetail[] = [];

    for (const txn of payload.transactions) {
      const entityId = txn.entityId?.startsWith(TEMP_ENTITY_PREFIX)
        ? (tempIdMap.get(txn.entityId) ?? txn.entityId)
        : txn.entityId;

      try {
        let type: 'Transfer' | 'Income' | 'Expense';
        if (txn.transactionType === 'transfer') type = 'Transfer';
        else if (txn.transactionType === 'income') type = 'Income';
        else type = 'Expense';

        insertTransaction({
          description: txn.description,
          account: txn.account,
          amount: txn.amount,
          date: txn.date,
          type,
          tags: txn.tags ?? [],
          entityId: entityId ?? null,
          entityName: txn.entityName ?? null,
          location: txn.location ?? null,
          rawRow: txn.rawRow,
          checksum: txn.checksum,
        });

        transactionsImported++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            description: txn.description.slice(0, 50),
            error: errorMessage,
          },
          '[CommitImport] Transaction write failed'
        );
        transactionsFailed++;
        failedDetails.push({
          checksum: txn.checksum ?? null,
          error: errorMessage,
        });
      }
    }

    // Phase 4: Retroactive reclassification — re-evaluate existing transactions
    // against the updated rule set and update any whose classification changed.
    const retroactiveReclassifications = reclassifyExistingTransactions(
      db,
      payload.transactions.map((t) => t.checksum).filter((c): c is string => c != null)
    );

    return {
      entitiesCreated,
      rulesApplied,
      tagRulesApplied,
      transactionsImported,
      transactionsFailed,
      failedDetails,
      retroactiveReclassifications,
    };
  });
}

const RECLASSIFY_BATCH_SIZE = 500;

/**
 * Re-evaluate all existing transactions against the current (updated) rule set.
 * Excludes transactions from the current import batch (by checksum).
 * Returns the count of transactions whose classification was updated.
 */
function reclassifyExistingTransactions(
  db: ReturnType<typeof getDrizzle>,
  importedChecksums: string[]
): number {
  // Fetch the full updated rule set
  const allRules = db
    .select()
    .from(transactionCorrections)
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  if (allRules.length === 0) return 0;

  let reclassified = 0;
  let offset = 0;

  while (true) {
    // Fetch existing transactions in batches, excluding current import's checksums
    let batchQuery = db
      .select({
        id: transactions.id,
        description: transactions.description,
        entityId: transactions.entityId,
        type: transactions.type,
        location: transactions.location,
      })
      .from(transactions)
      .$dynamic();

    if (importedChecksums.length > 0) {
      batchQuery = batchQuery.where(notInArray(transactions.checksum, importedChecksums));
    }

    const batch = batchQuery
      .orderBy(asc(transactions.id))
      .limit(RECLASSIFY_BATCH_SIZE)
      .offset(offset)
      .all();

    if (batch.length === 0) break;

    for (const txn of batch) {
      const match = findMatchingCorrectionFromRules(txn.description, allRules);

      if (!match) continue;

      const rule = match.correction;
      const newEntityId = rule.entityId ?? null;
      let newType: 'Transfer' | 'Income' | 'Expense' | null;
      if (!rule.transactionType) newType = null;
      else if (rule.transactionType === 'transfer') newType = 'Transfer';
      else if (rule.transactionType === 'income') newType = 'Income';
      else newType = 'Expense';
      const newLocation = rule.location ?? null;

      // Check if classification actually changed
      const entityChanged = newEntityId !== (txn.entityId ?? null);
      const typeChanged = newType !== null && newType !== txn.type;
      const locationChanged = newLocation !== null && newLocation !== (txn.location ?? null);

      if (!entityChanged && !typeChanged && !locationChanged) continue;

      const updates: Record<string, unknown> = {};
      if (entityChanged) {
        updates.entityId = newEntityId;
        updates.entityName = rule.entityName ?? null;
      }
      if (typeChanged) updates.type = newType;
      if (locationChanged) updates.location = newLocation;
      updates.lastEditedTime = new Date().toISOString();

      db.update(transactions).set(updates).where(eq(transactions.id, txn.id)).run();

      reclassified++;
    }

    offset += RECLASSIFY_BATCH_SIZE;
  }

  return reclassified;
}
