import { listVocabulary } from './vocabulary.js';

import type {
  TagRuleChangeSet,
  TagRuleImpactCounts,
  TagRuleImpactItem,
  TagSuggestion,
} from './types.js';

export interface PreviewInputTransaction {
  transactionId: string;
  description: string;
  entityId?: string | null;
  /** Optional: user-entered tags in current import; if present, rule suggestions must not override. */
  userTags?: string[];
}

interface ProposedRule {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
}

function materializeProposedRules(changeSet: TagRuleChangeSet): ProposedRule[] {
  const rules: ProposedRule[] = [];
  for (const op of changeSet.ops) {
    if (op.op === 'add') {
      rules.push({
        descriptionPattern: op.data.descriptionPattern,
        matchType: op.data.matchType,
        entityId: op.data.entityId ?? null,
        tags: op.data.tags,
      });
    }
  }
  return rules;
}

function ruleMatchesDescription(
  rule: ProposedRule,
  description: string,
  normalized: string
): boolean {
  const pattern = rule.descriptionPattern.toUpperCase();
  if (rule.matchType === 'exact') return normalized === pattern;
  if (rule.matchType === 'contains') return normalized.includes(pattern);
  try {
    return new RegExp(rule.descriptionPattern, 'i').test(description);
  } catch {
    return false;
  }
}

function suggestFromRules(
  description: string,
  entityId: string | null,
  rules: ProposedRule[],
  vocabulary: Set<string>
): TagSuggestion[] {
  const normalized = description.toUpperCase();
  const seen = new Set<string>();
  const out: TagSuggestion[] = [];

  for (const rule of rules) {
    if (rule.entityId && rule.entityId !== entityId) continue;
    if (!ruleMatchesDescription(rule, description, normalized)) continue;

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

export function previewTagRuleChangeSet(args: {
  changeSet: TagRuleChangeSet;
  transactions: PreviewInputTransaction[];
  maxPreviewItems: number;
}): { counts: TagRuleImpactCounts; affected: TagRuleImpactItem[] } {
  const txs = args.transactions.slice(0, args.maxPreviewItems);
  const vocabulary = new Set(listVocabulary().map((t) => t.toLowerCase()));
  const proposedRules = materializeProposedRules(args.changeSet);

  const affected: TagRuleImpactItem[] = [];
  for (const t of txs) {
    if (t.userTags && t.userTags.length > 0) continue;

    const after = suggestFromRules(t.description, t.entityId ?? null, proposedRules, vocabulary);
    const before: TagSuggestion[] = [];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
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
