/**
 * Thin shims that forward `transaction_tag_rules` CRUD to
 * `@pops/finance-db`'s `transactionTagRulesService`.
 *
 * Track N4 phase 1 PR 3 routing flip. The underlying SQLite file moves
 * to the finance pillar's `finance.db` via `getFinanceDrizzle()` — the
 * package's services already accept a `FinanceDb` handle (including a
 * transaction) as their first arg, so the legacy in-tree transaction
 * wrapping in `applyTagRuleChangeSet` keeps working unchanged.
 *
 * Domain errors thrown by the package (`TransactionTagRuleNotFoundError`)
 * are translated to the in-tree `NotFoundError` so the existing router
 * + consumers (the imports persistence pipeline at
 * `apps/pops-api/src/modules/finance/imports/lib/transaction-persistence.ts`)
 * keep seeing the same error type and the tRPC envelope keeps surfacing
 * `404 NOT_FOUND`. PR 4 of the phase 1 sequence deletes this shim once
 * nothing in-tree still imports from here.
 */
import { transactionTagRulesService, TransactionTagRuleNotFoundError } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../db/finance-handle.js';
import { NotFoundError } from '../../../shared/errors.js';
import { previewTagRuleChangeSet, type PreviewInputTransaction } from './preview.js';

import type { FinanceDb, TransactionTagRuleRow } from '@pops/finance-db';

import type { TagRuleChangeSet, TagRuleChangeSetOp, TagRuleChangeSetProposal } from './types.js';

export type TagRuleRow = TransactionTagRuleRow;

export { listVocabulary, upsertVocabularyTag } from './vocabulary.js';
export { previewTagRuleChangeSet };
export type { PreviewInputTransaction };

function rethrowAsNotFound(err: unknown, id: string): never {
  if (err instanceof TransactionTagRuleNotFoundError) {
    throw new NotFoundError('transaction_tag_rules', id);
  }
  throw err;
}

export function listTagRules(): TagRuleRow[] {
  return transactionTagRulesService.listTransactionTagRules(getFinanceDrizzle());
}

function addTagRule(tx: FinanceDb, data: Extract<TagRuleChangeSetOp, { op: 'add' }>['data']): void {
  transactionTagRulesService.createTransactionTagRule(tx, {
    descriptionPattern: data.descriptionPattern,
    matchType: data.matchType,
    entityId: data.entityId ?? null,
    tags: data.tags ?? [],
    confidence: data.confidence ?? 0.95,
    isActive: data.isActive ?? true,
    priority: data.priority ?? 0,
  });
}

function editTagRule(
  tx: FinanceDb,
  id: string,
  data: Extract<TagRuleChangeSetOp, { op: 'edit' }>['data']
): void {
  try {
    transactionTagRulesService.updateTransactionTagRule(tx, id, {
      entityId: data.entityId,
      tags: data.tags,
      confidence: data.confidence,
      isActive: data.isActive,
      priority: data.priority,
    });
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

function disableTagRule(tx: FinanceDb, id: string): void {
  try {
    transactionTagRulesService.disableTransactionTagRule(tx, id);
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

function removeTagRule(tx: FinanceDb, id: string): void {
  try {
    transactionTagRulesService.deleteTransactionTagRule(tx, id);
  } catch (err) {
    rethrowAsNotFound(err, id);
  }
}

function applyOp(tx: FinanceDb, op: TagRuleChangeSetOp): void {
  switch (op.op) {
    case 'add':
      addTagRule(tx, op.data);
      return;
    case 'edit':
      editTagRule(tx, op.id, op.data);
      return;
    case 'disable':
      disableTagRule(tx, op.id);
      return;
    case 'remove':
      removeTagRule(tx, op.id);
  }
}

export function applyTagRuleChangeSet(changeSet: TagRuleChangeSet): TagRuleRow[] {
  const db = getFinanceDrizzle();
  return db.transaction((tx) => {
    for (const op of changeSet.ops) applyOp(tx, op);
    return transactionTagRulesService.listTransactionTagRules(tx);
  });
}

export function proposeTagRuleChangeSet(args: {
  signal: {
    descriptionPattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    entityId?: string | null;
    tags: string[];
  };
  transactions: PreviewInputTransaction[];
  maxPreviewItems: number;
  rejectionFeedback?: string;
}): TagRuleChangeSetProposal {
  const changeSet: TagRuleChangeSet = {
    source: 'tag-edit-signal',
    reason: args.rejectionFeedback
      ? `Revised tag rule incorporating rejection feedback: ${args.rejectionFeedback}`
      : 'Create new tag rule from tag edit signal',
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: args.signal.descriptionPattern,
          matchType: args.signal.matchType,
          entityId: args.signal.entityId ?? null,
          tags: args.signal.tags,
          confidence: 0.95,
          isActive: true,
        },
      },
    ],
  };

  const preview = previewTagRuleChangeSet({
    changeSet,
    transactions: args.transactions,
    maxPreviewItems: args.maxPreviewItems,
  });

  const baseRationale = `Add new tag rule (${args.signal.matchType}:${args.signal.descriptionPattern}) from tag edit signal`;
  const rationale = args.rejectionFeedback
    ? `${baseRationale} — revised after rejection: "${args.rejectionFeedback}"`
    : baseRationale;

  return { changeSet, rationale, preview };
}
