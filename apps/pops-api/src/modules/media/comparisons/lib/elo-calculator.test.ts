import { describe, expect, it } from 'vitest';

import { drawTierOutcome, ELO_K, expectedScore } from './elo-calculator.js';

describe('elo-calculator', () => {
  describe('ELO_K', () => {
    it('is 32', () => {
      expect(ELO_K).toBe(32);
    });
  });

  describe('expectedScore', () => {
    it('returns 0.5 for equal ratings', () => {
      expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
    });

    it('returns higher value when A is stronger', () => {
      const result = expectedScore(1700, 1500);
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(1);
    });

    it('returns lower value when A is weaker', () => {
      const result = expectedScore(1300, 1500);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(0.5);
    });

    it('expectedScore(A,B) + expectedScore(B,A) = 1', () => {
      const eA = expectedScore(1600, 1400);
      const eB = expectedScore(1400, 1600);
      expect(eA + eB).toBeCloseTo(1, 10);
    });

    it('400-point gap gives ~0.909 expected score', () => {
      expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 2);
    });
  });

  describe('drawTierOutcome', () => {
    it('returns 0.7 for high', () => {
      expect(drawTierOutcome('high')).toBe(0.7);
    });

    it('returns 0.3 for low', () => {
      expect(drawTierOutcome('low')).toBe(0.3);
    });

    it('returns 0.5 for mid', () => {
      expect(drawTierOutcome('mid')).toBe(0.5);
    });

    it('returns 0.5 for null', () => {
      expect(drawTierOutcome(null)).toBe(0.5);
    });

    it('returns 0.5 for undefined', () => {
      expect(drawTierOutcome(undefined)).toBe(0.5);
    });
  });
});
