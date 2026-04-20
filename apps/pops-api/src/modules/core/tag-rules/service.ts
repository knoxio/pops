import { desc, eq } from 'drizzle-orm';

import { transactionTagRules } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';
import { previewTagRuleChangeSet, type PreviewInputTransaction } from './preview.js';

import type { TransactionTagRuleRow } from '@pops/db-types';

import type { TagRuleChangeSet, TagRuleChangeSetOp, TagRuleChangeSetProposal } from './types.js';

export type TagRuleRow = TransactionTagRuleRow;

export { listVocabulary, upsertVocabularyTag } from './vocabulary.js';
export { previewTagRuleChangeSet };
export type { PreviewInputTransaction };

export function listTagRules(): TagRuleRow[] {
  return getDrizzle()
    .select()
    .from(transactionTagRules)
    .orderBy(desc(transactionTagRules.confidence), desc(transactionTagRules.timesApplied))
    .all();
}

type TagRulesTx = ReturnType<typeof getDrizzle>;

function addTagRule(
  tx: TagRulesTx,
  data: Extract<TagRuleChangeSetOp, { op: 'add' }>['data']
): void {
  tx.insert(transactionTagRules)
    .values({
      descriptionPattern: data.descriptionPattern,
      matchType: data.matchType,
      entityId: data.entityId ?? null,
      tags: JSON.stringify(data.tags ?? []),
      confidence: data.confidence ?? 0.95,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 0,
      timesApplied: 0,
    })
    .run();
}

function editTagRule(
  tx: TagRulesTx,
  id: string,
  data: Extract<TagRuleChangeSetOp, { op: 'edit' }>['data']
): void {
  const existing = tx
    .select({ id: transactionTagRules.id })
    .from(transactionTagRules)
    .where(eq(transactionTagRules.id, id))
    .get();
  if (!existing) throw new NotFoundError('transaction_tag_rules', id);

  tx.update(transactionTagRules)
    .set({
      entityId: data.entityId !== undefined ? data.entityId : undefined,
      tags: data.tags ? JSON.stringify(data.tags) : undefined,
      confidence: data.confidence ?? undefined,
      isActive: data.isActive ?? undefined,
      priority: data.priority ?? undefined,
    })
    .where(eq(transactionTagRules.id, id))
    .run();
}

function disableTagRule(tx: TagRulesTx, id: string): void {
  const res = tx
    .update(transactionTagRules)
    .set({ isActive: false })
    .where(eq(transactionTagRules.id, id))
    .run();
  if (res.changes === 0) throw new NotFoundError('transaction_tag_rules', id);
}

function removeTagRule(tx: TagRulesTx, id: string): void {
  const res = tx.delete(transactionTagRules).where(eq(transactionTagRules.id, id)).run();
  if (res.changes === 0) throw new NotFoundError('transaction_tag_rules', id);
}

function applyOp(tx: TagRulesTx, op: TagRuleChangeSetOp): void {
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
  const db = getDrizzle();
  return db.transaction((tx) => {
    for (const op of changeSet.ops) applyOp(tx, op);
    return tx
      .select()
      .from(transactionTagRules)
      .orderBy(desc(transactionTagRules.confidence), desc(transactionTagRules.timesApplied))
      .all();
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
