import { parseJsonStringArray } from '../../../shared/json.js';

import type {
  ChangeSetImpactCounts,
  ChangeSetImpactItem,
  CorrectionClassificationOutcome,
  CorrectionMatchResult,
} from './types.js';

export function outcomeFromMatch(
  match: CorrectionMatchResult | null
): CorrectionClassificationOutcome {
  if (!match) {
    return {
      ruleId: null,
      entityId: null,
      entityName: null,
      location: null,
      tags: [],
      transactionType: null,
    };
  }

  const r = match.correction;
  return {
    ruleId: r.id,
    entityId: r.entityId ?? null,
    entityName: r.entityName ?? null,
    location: r.location ?? null,
    tags: parseJsonStringArray(r.tags),
    transactionType: r.transactionType ?? null,
  };
}

export function mergeTags(base: string[], add: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of base) {
    if (!seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  for (const t of add) {
    if (!seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  return result;
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => b[i] === t);
}

export function outcomeChanged(
  a: CorrectionClassificationOutcome,
  b: CorrectionClassificationOutcome
): boolean {
  if (a.ruleId !== b.ruleId) return true;
  if (a.entityId !== b.entityId) return true;
  if (a.entityName !== b.entityName) return true;
  if (a.location !== b.location) return true;
  if (a.transactionType !== b.transactionType) return true;
  return !tagsEqual(a.tags, b.tags);
}

export function computeImpactCounts(items: ChangeSetImpactItem[]): ChangeSetImpactCounts {
  let entityChanges = 0;
  let locationChanges = 0;
  let tagChanges = 0;
  let typeChanges = 0;

  for (const item of items) {
    if (
      item.before.entityId !== item.after.entityId ||
      item.before.entityName !== item.after.entityName
    ) {
      entityChanges += 1;
    }
    if (item.before.location !== item.after.location) locationChanges += 1;
    if (item.before.transactionType !== item.after.transactionType) typeChanges += 1;
    if (!tagsEqual(item.before.tags, item.after.tags)) tagChanges += 1;
  }

  return { affected: items.length, entityChanges, locationChanges, tagChanges, typeChanges };
}
