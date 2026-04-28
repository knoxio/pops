/**
 * Tests for citation tracker (#2242).
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  adjustedStalenessDays,
  citationStalenessMultiplier,
  getCitationCount,
  recordCitation,
  recordCitations,
  resetCitationCounts,
} from '../detectors/citation-tracker.js';

describe('citation-tracker', () => {
  afterEach(() => {
    resetCitationCounts();
  });

  describe('recordCitation / getCitationCount', () => {
    it('starts at 0 for unknown engrams', () => {
      expect(getCitationCount('eng_unknown')).toBe(0);
    });

    it('increments count on each citation', () => {
      recordCitation('eng_1');
      recordCitation('eng_1');
      recordCitation('eng_1');
      expect(getCitationCount('eng_1')).toBe(3);
    });

    it('tracks multiple engrams independently', () => {
      recordCitation('eng_a');
      recordCitation('eng_b');
      recordCitation('eng_a');
      expect(getCitationCount('eng_a')).toBe(2);
      expect(getCitationCount('eng_b')).toBe(1);
    });
  });

  describe('recordCitations (batch)', () => {
    it('records multiple citations at once', () => {
      recordCitations(['eng_x', 'eng_y', 'eng_x']);
      expect(getCitationCount('eng_x')).toBe(2);
      expect(getCitationCount('eng_y')).toBe(1);
    });
  });

  describe('citationStalenessMultiplier', () => {
    it('returns 1.0 for 0 citations (no adjustment)', () => {
      expect(citationStalenessMultiplier(0)).toBe(1.0);
    });

    it('returns 0.8 for 1-2 citations', () => {
      expect(citationStalenessMultiplier(1)).toBe(0.8);
      expect(citationStalenessMultiplier(2)).toBe(0.8);
    });

    it('returns 0.7 for 3-5 citations', () => {
      expect(citationStalenessMultiplier(3)).toBe(0.7);
      expect(citationStalenessMultiplier(5)).toBe(0.7);
    });

    it('returns 0.5 for 6+ citations', () => {
      expect(citationStalenessMultiplier(6)).toBe(0.5);
      expect(citationStalenessMultiplier(100)).toBe(0.5);
    });

    it('returns 1.0 for negative values', () => {
      expect(citationStalenessMultiplier(-1)).toBe(1.0);
    });
  });

  describe('adjustedStalenessDays', () => {
    it('returns base days for uncited engrams', () => {
      expect(adjustedStalenessDays(90, 'eng_uncited')).toBe(90);
    });

    it('increases effective threshold for cited engrams', () => {
      recordCitation('eng_cited');
      recordCitation('eng_cited');
      // 2 citations → multiplier 0.8 → 90 / 0.8 = 112.5 → 113
      expect(adjustedStalenessDays(90, 'eng_cited')).toBe(113);
    });

    it('heavily cited engrams are much harder to flag as stale', () => {
      for (let i = 0; i < 10; i++) recordCitation('eng_popular');
      // 10 citations → multiplier 0.5 → 90 / 0.5 = 180
      expect(adjustedStalenessDays(90, 'eng_popular')).toBe(180);
    });
  });

  describe('resetCitationCounts', () => {
    it('clears all counts', () => {
      recordCitation('eng_test');
      resetCitationCounts();
      expect(getCitationCount('eng_test')).toBe(0);
    });
  });
});
