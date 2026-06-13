/**
 * Thin shims that forward the in-tree pattern-match read API to
 * `@pops/finance-db`'s `transactionCorrectionsService`.
 *
 * Reads route through `getFinanceDrizzle()` — the finance-owned
 * `transaction_corrections` table lives in `finance.db`.
 */
import { transactionCorrectionsService } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../../db/finance-handle.js';
import { classifyCorrectionMatch } from '../types.js';

import type { CorrectionMatchResult, CorrectionRow } from '../types.js';

export function findAllMatchingCorrectionFromDB(
  description: string,
  minConfidence: number = 0.7
): CorrectionRow[] {
  return transactionCorrectionsService.findAllMatchingTransactionCorrectionsFromDb(
    getFinanceDrizzle(),
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
    getFinanceDrizzle(),
    description
  );
}
