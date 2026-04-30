/**
 * Pre-AI classifier that auto-tags inbound transfer / income rows so they
 * skip the entity matcher and AI categorizer entirely (#2448).
 *
 * Issue context: in an Amex import, a row like
 * `description: "PayID Payment Received, Thank you", amount: -2300.00`
 * (negative amount = inbound payment to clear the credit card balance) was
 * sent to the AI categorizer, which surfaced "PayID Payment" as a suggested
 * entity in the Review step. That row is a transfer, not a merchant — the
 * user should not be asked to assign it to an entity at all.
 *
 * Rule (per issue): when amount < 0 AND the description contains a
 * transfer/income keyword, classify as transfer (no entity required).
 *
 * Sign convention: in this codebase, credit-card statements use `amount < 0`
 * for inbound payments (money coming IN to the card). Bank-account
 * statements use the same sign convention for outgoing transfers. Either
 * way, a negative-amount row paired with a transfer keyword is reliably an
 * inter-account movement, not a merchant transaction.
 */
import type { ParsedTransaction } from '../types.js';

/**
 * Keywords that indicate the row is an inter-account transfer or
 * income/refund event rather than a merchant purchase.
 *
 * The list is intentionally conservative: only words whose presence in a
 * negative-amount row is a strong signal of non-merchant intent. Adding
 * generic words like "fee" here would mis-classify real merchant fees
 * (e.g. "Annual Membership Fee" charged by a gym).
 */
const TRANSFER_KEYWORD_PATTERN = /\b(payment|transfer|refund|payid|salary|reimbursement)\b/i;

/**
 * Returns true when the transaction should be auto-classified as a transfer
 * and bypass both the entity matcher and AI categorizer.
 *
 * Both conditions must hold:
 *   1. amount < 0 (inbound on credit cards / outbound on bank accounts —
 *      either way, an inter-account movement)
 *   2. description matches one of the transfer keywords
 */
export function isTransferOrIncomeRow(transaction: ParsedTransaction): boolean {
  if (transaction.amount >= 0) return false;
  return TRANSFER_KEYWORD_PATTERN.test(transaction.description);
}
