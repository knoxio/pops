import {
  HIGH_CONFIDENCE_THRESHOLD,
  normalizeDescription,
} from '@pops/api/modules/core/corrections/types';

/**
 * Local re-evaluation engine (PRD-030 US-07).
 *
 * Re-evaluates uncertain and failed transactions against a merged rule set using
 * the same matching logic as the server-side findMatchingCorrectionFromRules.
 * Runs entirely client-side with no server round-trip.
 */
import type { Correction } from '@pops/api/modules/core/corrections/types';
import type { MatchedRule } from '@pops/api/modules/finance/imports';

import type { ProcessedTransaction } from '../store/importStore';

export interface ReEvaluationResult {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  affectedCount: number;
}

interface LocalMatchResult {
  correction: Correction;
  status: 'matched' | 'uncertain';
}

/** Local classifier for `Correction` (the upstream helper is typed on CorrectionRow). */
function classifyCorrection(correction: Correction): LocalMatchResult {
  return {
    correction,
    status: correction.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 'matched' : 'uncertain',
  };
}

/**
 * Returns ALL rules that match `description`, sorted by the old type-priority
 * order (exact → contains → regex), with confidence/timesApplied tie-breaking
 * within each type. First entry is the winner; subsequent entries are overridden.
 *
 * NOTE: This mirrors the local matching heuristic used before the server-side
 * priority column was introduced. The `matchedRules` array is populated using
 * the same single pass — no separate matching pass.
 */
function findAllMatchingRules(
  description: string,
  rules: Correction[],
  minConfidence: number = 0.7
): Correction[] {
  const normalized = normalizeDescription(description);
  const eligible = rules.filter((r) => r.isActive && r.confidence >= minConfidence);

  const exactMatches = eligible
    .filter((r) => r.matchType === 'exact' && r.descriptionPattern === normalized)
    .toSorted((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  const containsMatches = eligible
    .filter(
      (r) =>
        r.matchType === 'contains' &&
        r.descriptionPattern.length > 0 &&
        normalized.includes(r.descriptionPattern)
    )
    .toSorted((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  const regexMatches = eligible
    .filter((r) => r.matchType === 'regex' && r.descriptionPattern.length > 0)
    .filter((r) => {
      try {
        return new RegExp(r.descriptionPattern).test(normalized);
      } catch {
        return false;
      }
    })
    .toSorted((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  // Exact matches beat contains which beat regex (type-priority ordering).
  // Within each group collect ALL matches so overrides can be shown.
  if (exactMatches.length > 0) {
    // Winner is the first exact match; any contains/regex matches are also overridden
    return [...exactMatches, ...containsMatches, ...regexMatches];
  }
  if (containsMatches.length > 0) {
    return [...containsMatches, ...regexMatches];
  }
  return regexMatches;
}

function correctionToMatchedRule(rule: Correction): MatchedRule {
  return {
    ruleId: rule.id,
    pattern: rule.descriptionPattern,
    matchType: rule.matchType,
    confidence: rule.confidence,
    priority: rule.priority,
    entityId: rule.entityId ?? null,
    entityName: rule.entityName ?? null,
  };
}

function applyMatch(
  txn: ProcessedTransaction,
  allMatches: Correction[],
  correction: Correction
): ProcessedTransaction {
  return {
    ...txn,
    entity: {
      entityId: correction.entityId ?? undefined,
      entityName: correction.entityName ?? undefined,
      matchType: 'learned' as const,
      confidence: correction.confidence,
    },
    status: 'matched',
    transactionType: correction.transactionType ?? txn.transactionType,
    ruleProvenance: {
      source: 'correction' as const,
      ruleId: correction.id,
      pattern: correction.descriptionPattern,
      matchType: correction.matchType,
      confidence: correction.confidence,
    },
    matchedRules: allMatches.map(correctionToMatchedRule),
  };
}

interface BucketResult {
  matched: ProcessedTransaction[];
  remaining: ProcessedTransaction[];
  affected: number;
}

function processBucket(
  txns: ProcessedTransaction[],
  mergedRules: Correction[],
  minConfidence: number
): BucketResult {
  const matched: ProcessedTransaction[] = [];
  const remaining: ProcessedTransaction[] = [];
  let affected = 0;
  for (const txn of txns) {
    const allMatches = findAllMatchingRules(txn.description, mergedRules, minConfidence);
    const firstMatch = allMatches[0];
    const result = firstMatch ? classifyCorrection(firstMatch) : null;
    if (result && result.status === 'matched') {
      matched.push(applyMatch(txn, allMatches, result.correction));
      affected++;
    } else {
      remaining.push(txn);
    }
  }
  return { matched, remaining, affected };
}

/**
 * Re-evaluate uncertain and failed transactions against the merged rule set.
 * Transactions that now match are promoted to matched with the match result.
 * Returns the updated buckets and count of affected transactions.
 */
export function reevaluateTransactions(
  uncertain: ProcessedTransaction[],
  failed: ProcessedTransaction[],
  mergedRules: Correction[],
  minConfidence: number = 0.7
): ReEvaluationResult {
  const fromUncertain = processBucket(uncertain, mergedRules, minConfidence);
  const fromFailed = processBucket(failed, mergedRules, minConfidence);
  return {
    matched: [...fromUncertain.matched, ...fromFailed.matched],
    uncertain: fromUncertain.remaining,
    failed: fromFailed.remaining,
    affectedCount: fromUncertain.affected + fromFailed.affected,
  };
}
