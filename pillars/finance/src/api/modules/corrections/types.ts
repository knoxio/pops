/**
 * Correction-match classification helpers for the imports pipeline.
 *
 * Copied (per the severance rules) from the monolith
 * `core/corrections/types-base.ts`. `CorrectionRow` aliases the pillar db's
 * `TransactionCorrectionRow` rather than re-deriving the column shape.
 */
import { type TransactionCorrectionRow } from '../../../db/index.js';

export type CorrectionRow = TransactionCorrectionRow;

/** Confidence at/above which a learned correction is treated as a confident match. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.9;

export type CorrectionMatchStatus = 'matched' | 'uncertain';

export interface CorrectionMatchResult {
  correction: CorrectionRow;
  status: CorrectionMatchStatus;
}

/**
 * Classify a matched correction as a confident (`matched`) or tentative
 * (`uncertain`) outcome by its confidence relative to
 * {@link HIGH_CONFIDENCE_THRESHOLD}.
 */
export function classifyCorrectionMatch(correction: CorrectionRow): CorrectionMatchResult {
  return {
    correction,
    status: correction.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 'matched' : 'uncertain',
  };
}

/** Parse a JSON-encoded tags string from the corrections table into a string array. */
export function parseCorrectionTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
