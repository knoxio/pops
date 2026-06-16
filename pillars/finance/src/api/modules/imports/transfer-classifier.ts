/**
 * Pre-AI classifier that auto-tags inbound transfer / income rows so they skip
 * the entity matcher and AI categorizer entirely (#2448).
 *
 * Rule: a negative-amount row whose description contains a transfer/income
 * keyword is an inter-account movement, not a merchant purchase. Copied verbatim
 * from the monolith `lib/transfer-classifier.ts`.
 */
import type { ParsedTransaction } from './types.js';

const TRANSFER_KEYWORD_PATTERN = /\b(payment|transfer|refund|payid|salary|reimbursement)\b/i;

/** True when the row should be auto-classified as a transfer (bypassing matching/AI). */
export function isTransferOrIncomeRow(transaction: ParsedTransaction): boolean {
  if (transaction.amount >= 0) return false;
  return TRANSFER_KEYWORD_PATTERN.test(transaction.description);
}
