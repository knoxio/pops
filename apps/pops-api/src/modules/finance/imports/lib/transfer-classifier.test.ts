/**
 * Unit tests for transfer-classifier (#2448) — the pre-AI gate that
 * auto-classifies inbound transfers / income rows so they don't reach the
 * entity matcher or AI categorizer.
 */
import { describe, expect, it } from 'vitest';

import { isTransferOrIncomeRow } from './transfer-classifier.js';

import type { ParsedTransaction } from '../types.js';

function tx(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    date: '2026-04-30',
    description: 'PURCHASE AT MERCHANT',
    amount: 50,
    account: 'amex',
    rawRow: 'raw',
    checksum: 'sha',
    ...overrides,
  };
}

describe('isTransferOrIncomeRow', () => {
  describe('classifies as transfer when amount < 0 AND keyword present', () => {
    it('detects PayID payment received (negative amount)', () => {
      expect(
        isTransferOrIncomeRow(
          tx({ description: 'PayID Payment Received, Thank you', amount: -2300 })
        )
      ).toBe(true);
    });

    it('detects "Payment - Thank You" credit-card credit', () => {
      expect(isTransferOrIncomeRow(tx({ description: 'PAYMENT - THANK YOU', amount: -500 }))).toBe(
        true
      );
    });

    it('detects refund row', () => {
      expect(isTransferOrIncomeRow(tx({ description: 'Refund from vendor', amount: -120 }))).toBe(
        true
      );
    });

    it('detects salary deposit', () => {
      expect(isTransferOrIncomeRow(tx({ description: 'Salary March', amount: -5000 }))).toBe(true);
    });

    it('detects "transfer" keyword', () => {
      expect(
        isTransferOrIncomeRow(tx({ description: 'Inter-account Transfer', amount: -100 }))
      ).toBe(true);
    });

    it('detects "reimbursement"', () => {
      expect(
        isTransferOrIncomeRow(tx({ description: 'Reimbursement from Acme', amount: -75 }))
      ).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isTransferOrIncomeRow(tx({ description: 'payid received', amount: -1 }))).toBe(true);
      expect(isTransferOrIncomeRow(tx({ description: 'PAYID RECEIVED', amount: -1 }))).toBe(true);
    });
  });

  describe('does not classify when amount >= 0', () => {
    it('positive-amount row with transfer keyword (e.g. outgoing payment as a purchase)', () => {
      expect(isTransferOrIncomeRow(tx({ description: 'Payment to vendor', amount: 100 }))).toBe(
        false
      );
    });

    it('zero-amount row', () => {
      expect(isTransferOrIncomeRow(tx({ description: 'Refund pending', amount: 0 }))).toBe(false);
    });
  });

  describe('does not classify when keyword absent', () => {
    it('negative-amount row without a transfer keyword (e.g. credit card credit from chargeback)', () => {
      expect(
        isTransferOrIncomeRow(tx({ description: 'Adjustment - statement correction', amount: -50 }))
      ).toBe(false);
    });

    it('regular merchant purchase (positive amount, no keyword)', () => {
      expect(
        isTransferOrIncomeRow(tx({ description: 'Woolworths 1234 Bondi', amount: 75.5 }))
      ).toBe(false);
    });

    it('keyword as substring without word boundary does NOT match', () => {
      // "transferable" should not match "transfer" — keep specific to the
      // discrete words listed in TRANSFER_KEYWORD_PATTERN.
      expect(isTransferOrIncomeRow(tx({ description: 'Transferable Bond Co', amount: -100 }))).toBe(
        false
      );
    });
  });

  describe('edge cases', () => {
    it('handles description with surrounding whitespace', () => {
      expect(isTransferOrIncomeRow(tx({ description: '  PayID Payment  ', amount: -10 }))).toBe(
        true
      );
    });

    it('matches keyword anywhere in the description', () => {
      expect(
        isTransferOrIncomeRow(
          tx({ description: 'monthly recurring transfer to savings', amount: -200 })
        )
      ).toBe(true);
    });
  });
});
