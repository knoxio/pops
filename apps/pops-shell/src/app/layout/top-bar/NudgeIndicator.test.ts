import { describe, expect, it } from 'vitest';

import { nudgeRefetchInterval } from './NudgeIndicator';

const q = (fetchFailureCount: number) => ({ state: { fetchFailureCount } });

describe('nudgeRefetchInterval', () => {
  it('returns 60s when there are no failures', () => {
    expect(nudgeRefetchInterval(q(0))).toBe(60_000);
  });

  it('doubles the interval on each consecutive failure', () => {
    expect(nudgeRefetchInterval(q(1))).toBe(120_000);
    expect(nudgeRefetchInterval(q(2))).toBe(240_000);
    expect(nudgeRefetchInterval(q(3))).toBe(480_000);
    expect(nudgeRefetchInterval(q(4))).toBe(960_000);
  });

  it('stops polling after 5 consecutive failures', () => {
    expect(nudgeRefetchInterval(q(5))).toBe(false);
    expect(nudgeRefetchInterval(q(10))).toBe(false);
  });

  it('recovers to 60s when fetchFailureCount resets to 0 after a success', () => {
    // Simulate: failures accumulate → endpoint starts returning 200
    // → TanStack Query resets fetchFailureCount to 0
    expect(nudgeRefetchInterval(q(5))).toBe(false);
    expect(nudgeRefetchInterval(q(0))).toBe(60_000);
  });
});
