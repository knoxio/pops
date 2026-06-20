/**
 * Read-only matchers against `transaction_corrections`.
 *
 * Split out from `transaction-corrections.ts` so neither file exceeds the
 * 200-line cap. CRUD lives there; pattern matching lives here. Both
 * surface through the `transactionCorrectionsService` namespace on the
 * package barrel and the in-tree consumer treats them as one slice.
 */
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { transactionCorrections } from '../schema.js';
import {
  normalizeDescription,
  type TransactionCorrectionRow,
} from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';

function ruleMatchesNormalizedDescription(
  rule: TransactionCorrectionRow,
  normalized: string
): boolean {
  const pattern = rule.descriptionPattern;
  switch (rule.matchType) {
    case 'exact':
      return pattern.toUpperCase() === normalized;
    case 'contains':
      return pattern.length > 0 && normalized.includes(pattern.toUpperCase());
    case 'regex':
      if (pattern.length === 0) return false;
      try {
        return new RegExp(pattern, 'i').test(normalized);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Return every active correction whose pattern matches `description`, in
 * priority order (priority ASC, id ASC as tie-breaker).
 *
 * Filters out rules below `minConfidence` and inactive rules before the
 * in-memory pattern test, mirroring the in-tree
 * `findAllMatchingCorrectionFromDB` semantics.
 */
export function findAllMatchingTransactionCorrectionsFromDb(
  db: FinanceDb,
  description: string,
  minConfidence: number = 0.7
): TransactionCorrectionRow[] {
  const normalized = normalizeDescription(description);

  const candidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        gte(transactionCorrections.confidence, minConfidence)
      )
    )
    .orderBy(asc(transactionCorrections.priority), asc(transactionCorrections.id))
    .all();

  return candidates.filter((rule) => ruleMatchesNormalizedDescription(rule, normalized));
}

/**
 * Return every active correction whose pattern matches `description`, grouped
 * by `matchType` in `[exact, contains, regex]` order, with each group sorted
 * by `confidence DESC, timesApplied DESC`.
 *
 * Used by callers that need to surface all matches (not just the winning
 * rule) to the user — typically the rule-management UI.
 *
 * Regex rules with invalid patterns are silently dropped so a single
 * malformed entry can't poison the result.
 */
export function findAllMatchingTransactionCorrections(
  db: FinanceDb,
  description: string
): TransactionCorrectionRow[] {
  const normalized = normalizeDescription(description);

  const exactMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, 'exact'),
        eq(transactionCorrections.descriptionPattern, normalized)
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const containsMatches = db
    .select()
    .from(transactionCorrections)
    .where(
      and(
        eq(transactionCorrections.isActive, true),
        eq(transactionCorrections.matchType, 'contains'),
        sql`${normalized} LIKE '%' || ${transactionCorrections.descriptionPattern} || '%'`
      )
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexCandidates = db
    .select()
    .from(transactionCorrections)
    .where(
      and(eq(transactionCorrections.isActive, true), eq(transactionCorrections.matchType, 'regex'))
    )
    .orderBy(desc(transactionCorrections.confidence), desc(transactionCorrections.timesApplied))
    .all();

  const regexMatches: TransactionCorrectionRow[] = [];
  for (const row of regexCandidates) {
    try {
      if (new RegExp(row.descriptionPattern).test(normalized)) {
        regexMatches.push(row);
      }
    } catch {
      // skip invalid regex pattern — see fn doc-comment
    }
  }

  return [...exactMatches, ...containsMatches, ...regexMatches];
}
