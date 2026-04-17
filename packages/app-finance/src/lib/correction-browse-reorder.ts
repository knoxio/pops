import { newClientId } from '../components/imports/hooks/useLocalOps';

import type { LocalOp } from '../components/imports/correction-proposal-shared';
import type { CorrectionRule } from '../components/imports/RulePicker';

/** Priority order for browse sidebar (PRD-032 US-05). */
export function compareRulesForBrowse(a: CorrectionRule, b: CorrectionRule): number {
  const pa = a.priority - b.priority;
  if (pa !== 0) return pa;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function effectiveRulePriority(rule: CorrectionRule, localOps: LocalOp[]): number {
  for (let i = localOps.length - 1; i >= 0; i -= 1) {
    const o = localOps[i];
    if (!o || o.kind !== 'edit') continue;
    if (o.targetRuleId === rule.id && o.data.priority !== undefined) {
      return o.data.priority;
    }
  }
  return rule.priority;
}

export function sortRulesForBrowseDisplay(
  rules: CorrectionRule[],
  localOps: LocalOp[]
): CorrectionRule[] {
  return [...rules].toSorted((a, b) => {
    const pa = effectiveRulePriority(a, localOps) - effectiveRulePriority(b, localOps);
    if (pa !== 0) return pa;
    return compareRulesForBrowse(a, b);
  });
}

function editDataFromRule(rule: CorrectionRule) {
  return {
    entityId: rule.entityId ?? undefined,
    entityName: rule.entityName ?? undefined,
    location: rule.location ?? undefined,
    tags: rule.tags,
    transactionType: rule.transactionType ?? undefined,
    isActive: rule.isActive,
    confidence: rule.confidence,
    priority: rule.priority,
  };
}

/**
 * After a drag reorder of `orderedRules`, upsert `edit` ops so priorities become
 * 10, 20, 30, … (gaps of 10).
 */
export function applyBrowsePriorityReorder(
  orderedRules: CorrectionRule[],
  localOps: LocalOp[]
): LocalOp[] {
  let next = [...localOps];

  orderedRules.forEach((rule, index) => {
    const newPriority = (index + 1) * 10;
    const prevEffective = effectiveRulePriority(rule, next);
    if (prevEffective === newPriority) return;

    const existingIdx = next.findIndex((o) => o.kind === 'edit' && o.targetRuleId === rule.id);

    if (existingIdx !== -1) {
      const op = next[existingIdx];
      if (!op || op.kind !== 'edit') return;
      next = next.map((o, i) =>
        i === existingIdx && o.kind === 'edit'
          ? { ...o, data: { ...o.data, priority: newPriority }, dirty: true }
          : o
      );
      return;
    }

    next.push({
      kind: 'edit',
      clientId: newClientId('edit'),
      targetRuleId: rule.id,
      targetRule: rule,
      data: { ...editDataFromRule(rule), priority: newPriority },
      dirty: true,
    });
  });

  return next;
}
