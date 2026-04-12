/**
 * Local re-evaluation engine (PRD-030 US-07).
 *
 * Re-evaluates uncertain and failed transactions against a merged rule set using
 * the same matching logic as the server-side findMatchingCorrectionFromRules.
 * Runs entirely client-side with no server round-trip.
 */
import type {
  CorrectionMatchResult,
  CorrectionRow,
} from '@pops/api/modules/core/corrections/types';
import {
  classifyCorrectionMatch,
  normalizeDescription,
} from '@pops/api/modules/core/corrections/types';

import type { ProcessedTransaction } from '../store/importStore';

export interface ReEvaluationResult {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  affectedCount: number;
}

/**
 * Pure in-memory matcher — mirrors server-side findMatchingCorrectionFromRules.
 */
function findMatchingRule(
  description: string,
  rules: CorrectionRow[],
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const normalized = normalizeDescription(description);
  // isActive is stored as integer in SQLite but typed as boolean via Drizzle mode: "boolean".
  // Use truthiness to handle both representations (1/true).
  const eligible = rules.filter((r) => !!r.isActive && r.confidence >= minConfidence);

  const exactMatches = eligible
    .filter((r) => r.matchType === 'exact' && r.descriptionPattern === normalized)
    .sort((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  if (exactMatches[0]) return classifyCorrectionMatch(exactMatches[0]);

  const containsMatches = eligible
    .filter(
      (r) =>
        r.matchType === 'contains' &&
        r.descriptionPattern.length > 0 &&
        normalized.includes(r.descriptionPattern)
    )
    .sort((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  if (containsMatches[0]) return classifyCorrectionMatch(containsMatches[0]);

  const regexMatches = eligible
    .filter((r) => r.matchType === 'regex' && r.descriptionPattern.length > 0)
    .filter((r) => {
      try {
        return new RegExp(r.descriptionPattern).test(normalized);
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.confidence - a.confidence || b.timesApplied - a.timesApplied);

  if (regexMatches[0]) return classifyCorrectionMatch(regexMatches[0]);

  return null;
}

/**
 * Re-evaluate uncertain and failed transactions against the merged rule set.
 * Transactions that now match are promoted to matched with the match result.
 * Returns the updated buckets and count of affected transactions.
 */
export function reevaluateTransactions(
  uncertain: ProcessedTransaction[],
  failed: ProcessedTransaction[],
  mergedRules: CorrectionRow[],
  minConfidence: number = 0.7
): ReEvaluationResult {
  const newMatched: ProcessedTransaction[] = [];
  const stillUncertain: ProcessedTransaction[] = [];
  const stillFailed: ProcessedTransaction[] = [];
  let affectedCount = 0;

  for (const txn of uncertain) {
    const match = findMatchingRule(txn.description, mergedRules, minConfidence);
    if (match && match.status === 'matched') {
      newMatched.push({
        ...txn,
        entity: {
          entityId: match.correction.entityId ?? undefined,
          entityName: match.correction.entityName ?? undefined,
          matchType: 'learned' as const,
          confidence: match.correction.confidence,
        },
        status: 'matched',
        transactionType: match.correction.transactionType ?? txn.transactionType,
        ruleProvenance: {
          source: 'correction' as const,
          ruleId: match.correction.id,
          pattern: match.correction.descriptionPattern,
          matchType: match.correction.matchType,
          confidence: match.correction.confidence,
        },
      });
      affectedCount++;
    } else {
      stillUncertain.push(txn);
    }
  }

  for (const txn of failed) {
    const match = findMatchingRule(txn.description, mergedRules, minConfidence);
    if (match && match.status === 'matched') {
      newMatched.push({
        ...txn,
        entity: {
          entityId: match.correction.entityId ?? undefined,
          entityName: match.correction.entityName ?? undefined,
          matchType: 'learned' as const,
          confidence: match.correction.confidence,
        },
        status: 'matched',
        transactionType: match.correction.transactionType ?? txn.transactionType,
        ruleProvenance: {
          source: 'correction' as const,
          ruleId: match.correction.id,
          pattern: match.correction.descriptionPattern,
          matchType: match.correction.matchType,
          confidence: match.correction.confidence,
        },
      });
      affectedCount++;
    } else {
      stillFailed.push(txn);
    }
  }

  return {
    matched: newMatched,
    uncertain: stillUncertain,
    failed: stillFailed,
    affectedCount,
  };
}
