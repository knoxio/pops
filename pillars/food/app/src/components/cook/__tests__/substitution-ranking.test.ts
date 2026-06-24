/**
 * Pins the candidate sort key documented in
 * `pillars/food/docs/prds/cook-time-substitutions`:
 *   1. |ratio - 1.0| ASC
 *   2. context-tag overlap with the recipe DESC
 *   3. earliest batch expiry ASC NULLS LAST
 *   4. ingredient name ASC (deterministic tie-break)
 */
import { describe, expect, it } from 'vitest';

import { rankSubstitutionCandidates, type RankableCandidate } from '../substitution-ranking.js';

function candidate(over: Partial<RankableCandidate>): RankableCandidate {
  return {
    ratio: 1,
    contextTags: [],
    ingredientName: 'aaa',
    earliestExpiry: null,
    ...over,
  };
}

describe('rankSubstitutionCandidates', () => {
  it('puts the candidate closest to ratio 1.0 first', () => {
    const order = rankSubstitutionCandidates(
      [
        candidate({ ratio: 0.5, ingredientName: 'a' }),
        candidate({ ratio: 1.0, ingredientName: 'b' }),
        candidate({ ratio: 1.5, ingredientName: 'c' }),
      ],
      []
    );
    expect(order).toEqual([1, 0, 2]);
  });

  it('breaks ratio ties by context-tag overlap DESC', () => {
    const order = rankSubstitutionCandidates(
      [
        candidate({ ratio: 1, contextTags: ['savory'], ingredientName: 'a' }),
        candidate({ ratio: 1, contextTags: ['savory', 'frying'], ingredientName: 'b' }),
        candidate({ ratio: 1, contextTags: [], ingredientName: 'c' }),
      ],
      ['savory', 'frying']
    );
    expect(order).toEqual([1, 0, 2]);
  });

  it('breaks overlap ties by earliest expiry ASC NULLS LAST', () => {
    const order = rankSubstitutionCandidates(
      [
        candidate({ ratio: 1, earliestExpiry: null, ingredientName: 'a' }),
        candidate({ ratio: 1, earliestExpiry: '2026-06-10', ingredientName: 'b' }),
        candidate({ ratio: 1, earliestExpiry: '2026-06-05', ingredientName: 'c' }),
      ],
      []
    );
    expect(order).toEqual([2, 1, 0]);
  });

  it('falls back to ingredient name ASC for full ties', () => {
    const order = rankSubstitutionCandidates(
      [
        candidate({ ratio: 1, ingredientName: 'cherry' }),
        candidate({ ratio: 1, ingredientName: 'apple' }),
        candidate({ ratio: 1, ingredientName: 'banana' }),
      ],
      []
    );
    expect(order).toEqual([1, 2, 0]);
  });
});
