/**
 * Tag-rule ChangeSet service — propose (deterministic) + apply.
 *
 * The `apply` path wraps the ops in a single db transaction so a partial
 * ChangeSet never lands.
 */
import {
  type FinanceDb,
  transactionTagRulesService,
  type TransactionTagRuleRow,
} from '../../../db/index.js';
import { previewTagRuleChangeSet } from './preview.js';

import type { TagRuleChangeSet, TagRuleChangeSetOp } from '../../../contract/rest-tag-rules.js';
import type { PreviewInputTransaction, TagRuleChangeSetProposal } from './types.js';

/** Persisted rule with `tags` parsed from its JSON column to a `string[]`. */
export interface TagRule {
  id: string;
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
  isActive: boolean;
  confidence: number;
  priority: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function toTagRule(row: TransactionTagRuleRow): TagRule {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    tags: parseTags(row.tags),
    isActive: row.isActive,
    confidence: row.confidence,
    priority: row.priority,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function applyOp(tx: FinanceDb, op: TagRuleChangeSetOp): void {
  switch (op.op) {
    case 'add':
      transactionTagRulesService.createTransactionTagRule(tx, {
        descriptionPattern: op.data.descriptionPattern,
        matchType: op.data.matchType,
        entityId: op.data.entityId ?? null,
        tags: op.data.tags,
        confidence: op.data.confidence ?? 0.95,
        isActive: op.data.isActive ?? true,
        priority: op.data.priority ?? 0,
      });
      return;
    case 'edit':
      transactionTagRulesService.updateTransactionTagRule(tx, op.id, {
        entityId: op.data.entityId,
        tags: op.data.tags,
        confidence: op.data.confidence,
        isActive: op.data.isActive,
        priority: op.data.priority,
      });
      return;
    case 'disable':
      transactionTagRulesService.disableTransactionTagRule(tx, op.id);
      return;
    case 'remove':
      transactionTagRulesService.deleteTransactionTagRule(tx, op.id);
  }
}

export function applyTagRuleChangeSet(db: FinanceDb, changeSet: TagRuleChangeSet): TagRule[] {
  return db.transaction((tx) => {
    for (const op of changeSet.ops) applyOp(tx, op);
    return transactionTagRulesService.listTransactionTagRules(tx).map(toTagRule);
  });
}

export function proposeTagRuleChangeSet(
  db: FinanceDb,
  args: {
    signal: {
      descriptionPattern: string;
      matchType: 'exact' | 'contains' | 'regex';
      entityId?: string | null;
      tags: string[];
    };
    transactions: PreviewInputTransaction[];
    maxPreviewItems: number;
    rejectionFeedback?: string;
  }
): TagRuleChangeSetProposal {
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

  const preview = previewTagRuleChangeSet(db, {
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
