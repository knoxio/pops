import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCaller, setupTestContext } from '../../../shared/test-utils.js';
import { getStaleness, markStale, resetStaleness } from './staleness.js';

const ctx = setupTestContext();

beforeEach(() => {
  ctx.setup();
});

afterEach(() => {
  ctx.teardown();
});

describe('markStale', () => {
  it('inserts with staleness 0.5 on first mark', () => {
    const result = markStale('movie', 1);
    expect(result).toBe(0.5);
  });

  it('compounds to 0.25 on second mark', () => {
    markStale('movie', 1);
    const result = markStale('movie', 1);
    expect(result).toBe(0.25);
  });

  it('compounds to 0.125 on third mark', () => {
    markStale('movie', 1);
    markStale('movie', 1);
    const result = markStale('movie', 1);
    expect(result).toBe(0.125);
  });

  it('floors at 0.01', () => {
    // After 7 marks: 0.5^7 = 0.0078125, should floor to 0.01
    for (let i = 0; i < 6; i++) {
      markStale('movie', 1);
    }
    const result = markStale('movie', 1);
    expect(result).toBe(0.01);

    // Further marks stay at 0.01
    const again = markStale('movie', 1);
    expect(again).toBe(0.01);
  });

  it('tracks different media items independently', () => {
    markStale('movie', 1);
    markStale('movie', 1); // movie 1 → 0.25

    const result = markStale('movie', 2); // movie 2 → 0.5
    expect(result).toBe(0.5);

    expect(getStaleness('movie', 1)).toBe(0.25);
  });
});

describe('getStaleness', () => {
  it('returns 1.0 for items with no staleness row', () => {
    expect(getStaleness('movie', 999)).toBe(1.0);
  });

  it('returns current staleness value', () => {
    markStale('movie', 1);
    expect(getStaleness('movie', 1)).toBe(0.5);
  });
});

describe('resetStaleness', () => {
  it('resets staleness so getStaleness returns 1.0', () => {
    markStale('movie', 1);
    markStale('movie', 1); // 0.25
    expect(getStaleness('movie', 1)).toBe(0.25);

    resetStaleness('movie', 1);
    expect(getStaleness('movie', 1)).toBe(1.0);
  });

  it('is a no-op for items with no staleness row', () => {
    // Should not throw
    resetStaleness('movie', 999);
    expect(getStaleness('movie', 999)).toBe(1.0);
  });
});

describe('watch event resets staleness', () => {
  it('logWatch resets staleness for a completed watch', async () => {
    const caller = createCaller();

    // Mark movie 1 as stale
    markStale('movie', 1);
    markStale('movie', 1);
    expect(getStaleness('movie', 1)).toBe(0.25);

    // Log a completed watch for movie 1
    await caller.media.watchHistory.log({
      mediaType: 'movie',
      mediaId: 1,
      completed: 1,
    });

    // Staleness should be reset
    expect(getStaleness('movie', 1)).toBe(1.0);
  });

  it('logWatch does NOT reset staleness for incomplete watch', async () => {
    const caller = createCaller();

    markStale('movie', 1);
    expect(getStaleness('movie', 1)).toBe(0.5);

    await caller.media.watchHistory.log({
      mediaType: 'movie',
      mediaId: 1,
      completed: 0,
    });

    // Staleness should remain
    expect(getStaleness('movie', 1)).toBe(0.5);
  });
});
