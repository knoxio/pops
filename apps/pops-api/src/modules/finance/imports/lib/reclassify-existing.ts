import { asc, eq, notInArray } from 'drizzle-orm';

import { transactionCorrections, transactions } from '@pops/db-types';

import { findMatchingCorrectionFromRules } from '../../../core/corrections/service.js';

import type { getDrizzle } from '../../../../db.js';
import type { CorrectionRow } from '../../../core/corrections/types.js';

const RECLASSIFY_BATCH_SIZE = 500;

interface BatchTxn {
  id: string;
  description: string;
  entityId: string | null;
  type: string;
  location: string | null;
}

function deriveNewType(ruleType: string | null): 'Transfer' | 'Income' | 'Expense' | null {
  if (!ruleType) return null;
  if (ruleType === 'transfer') return 'Transfer';
  if (ruleType === 'income') return 'Income';
  return 'Expense';
}

interface RuleDerivedState {
  newEntityId: string | null;
  newType: 'Transfer' | 'Income' | 'Expense' | null;
  newLocation: string | null;
}

function deriveRuleState(rule: CorrectionRow): RuleDerivedState {
  return {
    newEntityId: rule.entityId ?? null,
    newType: deriveNewType(rule.transactionType),
    newLocation: rule.location ?? null,
  };
}

function buildReclassifyUpdates(
  txn: BatchTxn,
  rule: CorrectionRow
): Record<string, unknown> | null {
  const state = deriveRuleState(rule);

  const entityChanged = state.newEntityId !== (txn.entityId ?? null);
  const typeChanged = state.newType !== null && state.newType !== txn.type;
  const locationChanged =
    state.newLocation !== null && state.newLocation !== (txn.location ?? null);

  if (!entityChanged && !typeChanged && !locationChanged) return null;

  const updates: Record<string, unknown> = {};
  if (entityChanged) {
    updates.entityId = state.newEntityId;
    updates.entityName = rule.entityName ?? null;
  }
  if (typeChanged) updates.type = state.newType;
  if (locationChanged) updates.location = state.newLocation;
  updates.lastEditedTime = new Date().toISOString();
  return updates;
}

function fetchBatch(
  db: ReturnType<typeof getDrizzle>,
  importedChecksums: string[],
  offset: number
): BatchTxn[] {
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

  return batchQuery.orderBy(asc(transactions.id)).limit(RECLASSIFY_BATCH_SIZE).offset(offset).all();
}

/**
 * Re-evaluate all existing transactions against the current (updated) rule set.
 * Excludes transactions from the current import batch (by checksum).
 * Returns the count of transactions whose classification was updated.
 */
export function reclassifyExistingTransactions(
  db: ReturnType<typeof getDrizzle>,
  importedChecksums: string[]
): number {
  const allRules = db
    .select()
    .from(transactionCorrections)
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  if (allRules.length === 0) return 0;

  let reclassified = 0;
  let offset = 0;

  while (true) {
    const batch = fetchBatch(db, importedChecksums, offset);
    if (batch.length === 0) break;

    for (const txn of batch) {
      const match = findMatchingCorrectionFromRules(txn.description, allRules);
      if (!match) continue;
      const updates = buildReclassifyUpdates(txn, match.correction);
      if (!updates) continue;
      db.update(transactions).set(updates).where(eq(transactions.id, txn.id)).run();
      reclassified++;
    }

    offset += RECLASSIFY_BATCH_SIZE;
  }

  return reclassified;
}
