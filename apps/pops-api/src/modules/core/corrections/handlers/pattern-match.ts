/**
 * Thin shims that forward the in-tree pattern-match read API to
 * `@pops/finance-db`'s `transactionCorrectionsService`.
 *
 * Track N3 phase 1 PR 3 routing flip — see `query-helpers.ts` for the
 * full rationale. The `getDrizzle()` handle still resolves to the shared
 * `pops.db` so the in-tree imports pipeline (the other consumer) keeps
 * seeing the same rows.
 */
import { transactionCorrectionsService } from '@pops/finance-db';

import { getDrizzle } from '../../../../db.js';
import { classifyCorrectionMatch } from '../types.js';

import type { CorrectionMatchResult, CorrectionRow } from '../types.js';

export function findAllMatchingCorrectionFromDB(
  description: string,
  minConfidence: number = 0.7
): CorrectionRow[] {
  return transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb(
    getDrizzle(),
    description,
    minConfidence
  );
}

export function findMatchingCorrection(
  description: string,
  minConfidence: number = 0.7
): CorrectionMatchResult | null {
  const allMatches = findAllMatchingCorrectionFromDB(description, minConfidence);
  const first = allMatches[0];
  if (!first) return null;
  return classifyCorrectionMatch(first);
}

export function findAllMatchingCorrections(description: string): CorrectionRow[] {
  return transactionCorrectionsService.findAllMatchingTransactionCorrections(
    getDrizzle(),
    description
  );
}
