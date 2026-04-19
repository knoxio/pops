import { desc, eq } from 'drizzle-orm';

import { tagVocabulary, transactionTagRules } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { TransactionTagRuleRow } from '@pops/db-types';

import type {
  TagRuleChangeSet,
  TagRuleChangeSetOp,
  TagRuleChangeSetProposal,
  TagRuleImpactCounts,
  TagRuleImpactItem,
  TagSuggestion,
} from './types.js';

export type TagRuleRow = TransactionTagRuleRow;

export function listVocabulary(): string[] {
  const db = getDrizzle();
  return db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.isActive, true))
    .all()
    .map((r) => r.tag);
}

export function upsertVocabularyTag(tag: string, source: 'seed' | 'user'): void {
  const db = getDrizzle();
  db.insert(tagVocabulary)
    .values({ tag, source, isActive: true })
    .onConflictDoUpdate({
      target: tagVocabulary.tag,
      set: { isActive: true },
    })
    .run();
}

export function listTagRules(): TagRuleRow[] {
  const db = getDrizzle();
  return db
    .select()
    .from(transactionTagRules)
    .orderBy(desc(transactionTagRules.confidence), desc(transactionTagRules.timesApplied))
    .all();
}

export function applyTagRuleChangeSet(changeSet: TagRuleChangeSet): TagRuleRow[] {
  const db = getDrizzle();
  return db.transaction((tx) => {
    for (const op of changeSet.ops) {
      applyOp(tx, op);
    }
    return tx
      .select()
      .from(transactionTagRules)
      .orderBy(desc(transactionTagRules.confidence), desc(transactionTagRules.timesApplied))
      .all();
  });
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

// ---------------------------------------------------------------------------
// Deterministic preview (v1): suggestion-only diffs for provided transactions
// ---------------------------------------------------------------------------

export interface PreviewInputTransaction {
  transactionId: string;
  description: string;
  entityId?: string | null;
  /** Optional: user-entered tags in current import; if present, rule suggestions must not override. */
  userTags?: string[];
}

export function previewTagRuleChangeSet(args: {
  changeSet: TagRuleChangeSet;
  transactions: PreviewInputTransaction[];
  maxPreviewItems: number;
}): { counts: TagRuleImpactCounts; affected: TagRuleImpactItem[] } {
  const txs = args.transactions.slice(0, args.maxPreviewItems);
  const vocabulary = new Set(listVocabulary().map((t) => t.toLowerCase()));

  // For v1 preview we only simulate rule tags from the proposed ChangeSet ops.
  const proposedRules = materializeProposedRules(args.changeSet);

  const affected: TagRuleImpactItem[] = [];
  for (const t of txs) {
    const before: TagSuggestion[] = [];
    const after = suggestFromRules(t.description, t.entityId ?? null, proposedRules, vocabulary);

    if (t.userTags && t.userTags.length > 0) {
      // Must not overwrite user-entered tags; preview still shows suggestions, but does not
      // mark as affected if user already set tags for this transaction in the current import.
      continue;
    }

    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) {
      affected.push({
        transactionId: t.transactionId,
        description: t.description,
        before: { suggestedTags: before },
        after: { suggestedTags: after },
      });
    }
  }

  const newTagProposals = affected
    .flatMap((a) => a.after.suggestedTags)
    .filter((t) => t.isNew).length;

  return {
    counts: {
      affected: affected.length,
      suggestionChanges: affected.length,
      newTagProposals,
    },
    affected,
  };
}

function materializeProposedRules(changeSet: TagRuleChangeSet): Array<{
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
}> {
  const rules: Array<{
    descriptionPattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    entityId: string | null;
    tags: string[];
  }> = [];
  for (const op of changeSet.ops) {
    if (op.op === 'add') {
      rules.push({
        descriptionPattern: op.data.descriptionPattern,
        matchType: op.data.matchType,
        entityId: op.data.entityId ?? null,
        tags: op.data.tags,
      });
    }
    // v1: edit/disable/remove preview for existing rules is handled by dedicated preview endpoint later
  }
  return rules;
}

function suggestFromRules(
  description: string,
  entityId: string | null,
  rules: Array<{
    descriptionPattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    entityId: string | null;
    tags: string[];
  }>,
  vocabulary: Set<string>
): TagSuggestion[] {
  const normalized = description.toUpperCase();
  const seen = new Set<string>();
  const out: TagSuggestion[] = [];

  for (const rule of rules) {
    if (rule.entityId && rule.entityId !== entityId) continue;
    const pattern = rule.descriptionPattern.toUpperCase();
    let matches: boolean;
    if (rule.matchType === 'exact') {
      matches = normalized === pattern;
    } else if (rule.matchType === 'contains') {
      matches = normalized.includes(pattern);
    } else {
      try {
        matches = new RegExp(rule.descriptionPattern, 'i').test(description);
      } catch {
        matches = false;
      }
    }

    if (!matches) continue;
    for (const tag of rule.tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push({
        tag,
        source: 'tag_rule',
        pattern: rule.descriptionPattern,
        isNew: !vocabulary.has(tag.toLowerCase()),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Proposal generation (v1): wrap preview + return ChangeSet
// ---------------------------------------------------------------------------

export function proposeTagRuleChangeSet(args: {
  signal: {
    descriptionPattern: string;
    matchType: 'exact' | 'contains' | 'regex';
    entityId?: string | null;
    tags: string[];
  };
  transactions: PreviewInputTransaction[];
  maxPreviewItems: number;
  /** Optional feedback from a previous rejection; incorporated into the rationale. */
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

  return {
    changeSet,
    rationale,
    preview,
  };
}
