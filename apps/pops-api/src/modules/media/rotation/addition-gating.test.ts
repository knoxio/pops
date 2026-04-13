import { describe, expect, it } from 'vitest';

import { getAdditionBudget } from './addition-gating.js';

describe('getAdditionBudget', () => {
  it('returns 0 when free space is below target', () => {
    expect(getAdditionBudget(90, 100, 15, 2)).toBe(0);
  });

  it('returns 0 when free space equals target exactly', () => {
    expect(getAdditionBudget(100, 100, 15, 2)).toBe(0);
  });

  it('returns daily max when there is plenty of headroom', () => {
    // 300 free, 100 target → 200 headroom, 200/15 = 13 possible, capped at 2
    expect(getAdditionBudget(300, 100, 15, 2)).toBe(2);
  });

  it('reduces count when headroom is tight', () => {
    // 210 free, 200 target → 10 headroom, 10/15 = 0 (floor)
    expect(getAdditionBudget(210, 200, 15, 2)).toBe(0);
  });

  it('allows partial additions when space is limited', () => {
    // 230 free, 200 target → 30 headroom, 30/15 = 2, but daily max is 5
    expect(getAdditionBudget(230, 200, 15, 5)).toBe(2);
  });

  it('returns 0 when avgMovieGb is 0', () => {
    expect(getAdditionBudget(300, 100, 0, 2)).toBe(0);
  });

  it('returns 0 when avgMovieGb is negative', () => {
    expect(getAdditionBudget(300, 100, -5, 2)).toBe(0);
  });

  it('handles large headroom correctly', () => {
    // 1000 free, 100 target → 900 headroom, 900/15 = 60, capped at 10
    expect(getAdditionBudget(1000, 100, 15, 10)).toBe(10);
  });
});
