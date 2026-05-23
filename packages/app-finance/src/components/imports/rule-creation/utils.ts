import type { TagRuleChangeSet } from '@pops/api/modules/core/tag-rules/types';
import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

export interface RuleProposal {
  id: string;
  entityId: string | null;
  entityName: string;
  pattern: string;
  tags: string[];
  affectsCount: number;
}

type EntityGroup = { entityId: string | null; entityName: string; txns: ConfirmedTransaction[] };

function groupByEntity(txns: ConfirmedTransaction[]): Map<string, EntityGroup> {
  const groups = new Map<string, EntityGroup>();
  for (const txn of txns) {
    if (!txn.tags?.length) continue;
    const key = txn.entityId ?? `desc:${txn.description.slice(0, 30)}`;
    const name = txn.entityName ?? txn.description.slice(0, 30);
    if (!groups.has(key))
      groups.set(key, { entityId: txn.entityId ?? null, entityName: name, txns: [] });
    groups.get(key)?.txns.push(txn);
  }
  return groups;
}

function commonTagsForGroup(group: EntityGroup): string[] {
  const counts = new Map<string, number>();
  for (const txn of group.txns) {
    for (const tag of new Set(txn.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const threshold = Math.ceil(group.txns.length * 0.5);
  return [...counts.entries()]
    .filter(([, c]) => c >= threshold)
    .toSorted((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

export function computeProposals(confirmedTransactions: ConfirmedTransaction[]): RuleProposal[] {
  const proposals: RuleProposal[] = [];
  let seq = 0;
  for (const [, group] of groupByEntity(confirmedTransactions)) {
    const tags = commonTagsForGroup(group);
    const pattern = group.entityName.toLowerCase().trim();
    if (!tags.length || !pattern) continue;
    proposals.push({
      id: `proposal-${seq++}`,
      entityId: group.entityId,
      entityName: group.entityName,
      pattern,
      tags,
      affectsCount: group.txns.length,
    });
  }
  return proposals;
}

export function buildChangeSet(p: RuleProposal): TagRuleChangeSet {
  return {
    source: 'import-batch',
    reason: `Rule detected from import batch for ${p.entityName}`,
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: p.pattern,
          matchType: 'contains',
          entityId: p.entityId,
          tags: p.tags,
          confidence: 0.9,
          isActive: true,
        },
      },
    ],
  };
}
