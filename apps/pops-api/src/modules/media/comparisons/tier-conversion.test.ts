import { describe, expect, it } from 'vitest';

import { convertTierPlacements, type TierPlacement } from './tier-conversion.js';

describe('convertTierPlacements', () => {
  it('returns empty array for empty placements', () => {
    expect(convertTierPlacements([])).toEqual([]);
  });

  it('returns empty array for single placement', () => {
    const placements: TierPlacement[] = [{ movieId: 1, tier: 'S' }];
    expect(convertTierPlacements(placements)).toEqual([]);
  });

  it('generates C(N,2) comparisons for N placements', () => {
    const placements: TierPlacement[] = [
      { movieId: 1, tier: 'S' },
      { movieId: 2, tier: 'A' },
      { movieId: 3, tier: 'B' },
      { movieId: 4, tier: 'C' },
      { movieId: 5, tier: 'D' },
    ];
    const result = convertTierPlacements(placements);
    // C(5,2) = 10
    expect(result).toHaveLength(10);
  });

  it('generates 3 comparisons for 3 movies', () => {
    const placements: TierPlacement[] = [
      { movieId: 1, tier: 'S' },
      { movieId: 2, tier: 'B' },
      { movieId: 3, tier: 'D' },
    ];
    const result = convertTierPlacements(placements);
    expect(result).toHaveLength(3);
  });

  it('generates 6 comparisons for 4 movies', () => {
    const placements: TierPlacement[] = [
      { movieId: 1, tier: 'S' },
      { movieId: 2, tier: 'A' },
      { movieId: 3, tier: 'B' },
      { movieId: 4, tier: 'C' },
    ];
    const result = convertTierPlacements(placements);
    expect(result).toHaveLength(6);
  });

  describe('same-tier draws', () => {
    it('S tier → draw with high', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'S' },
        { movieId: 2, tier: 'S' },
      ]);
      expect(result).toEqual([{ mediaAId: 1, mediaBId: 2, winnerId: 0, drawTier: 'high' }]);
    });

    it('A tier → draw with high', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'A' },
        { movieId: 2, tier: 'A' },
      ]);
      expect(result).toEqual([{ mediaAId: 1, mediaBId: 2, winnerId: 0, drawTier: 'high' }]);
    });

    it('B tier → draw with mid', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'B' },
        { movieId: 2, tier: 'B' },
      ]);
      expect(result).toEqual([{ mediaAId: 1, mediaBId: 2, winnerId: 0, drawTier: 'mid' }]);
    });

    it('C tier → draw with low', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'C' },
        { movieId: 2, tier: 'C' },
      ]);
      expect(result).toEqual([{ mediaAId: 1, mediaBId: 2, winnerId: 0, drawTier: 'low' }]);
    });

    it('D tier → draw with low', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'D' },
        { movieId: 2, tier: 'D' },
      ]);
      expect(result).toEqual([{ mediaAId: 1, mediaBId: 2, winnerId: 0, drawTier: 'low' }]);
    });
  });

  describe('cross-tier wins', () => {
    it('higher tier movie wins (S beats D)', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'S' },
        { movieId: 2, tier: 'D' },
      ]);
      expect(result).toEqual([{ mediaAId: 1, mediaBId: 2, winnerId: 1, drawTier: null }]);
    });

    it('higher tier movie wins (A beats C)', () => {
      const result = convertTierPlacements([
        { movieId: 10, tier: 'A' },
        { movieId: 20, tier: 'C' },
      ]);
      expect(result).toEqual([{ mediaAId: 10, mediaBId: 20, winnerId: 10, drawTier: null }]);
    });

    it('higher tier wins when placed second', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'D' },
        { movieId: 2, tier: 'S' },
      ]);
      expect(result).toEqual([{ mediaAId: 1, mediaBId: 2, winnerId: 2, drawTier: null }]);
    });
  });

  describe('mixed scenario', () => {
    it('handles a mix of same-tier and cross-tier pairs', () => {
      const result = convertTierPlacements([
        { movieId: 1, tier: 'S' },
        { movieId: 2, tier: 'S' },
        { movieId: 3, tier: 'C' },
      ]);

      expect(result).toHaveLength(3);
      // S vs S → draw high
      expect(result[0]).toEqual({ mediaAId: 1, mediaBId: 2, winnerId: 0, drawTier: 'high' });
      // S vs C → movie 1 wins
      expect(result[1]).toEqual({ mediaAId: 1, mediaBId: 3, winnerId: 1, drawTier: null });
      // S vs C → movie 2 wins
      expect(result[2]).toEqual({ mediaAId: 2, mediaBId: 3, winnerId: 2, drawTier: null });
    });
  });
});
