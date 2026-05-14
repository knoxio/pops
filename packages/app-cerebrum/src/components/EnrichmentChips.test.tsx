/**
 * Tests for EnrichmentChips pure helpers (PRD-081 US-07).
 *
 * The component itself is exercised through the IngestPage integration tests;
 * these unit tests cover the polling cadence and scope-mutation helpers that
 * are easy to break and important to get right.
 */
import { describe, expect, it } from 'vitest';

import {
  appendUnique,
  hasStoppedPolling,
  refetchInterval,
  replaceScope,
  segmentSetKey,
} from './enrichment-chips-helpers';

describe('refetchInterval (PRD-081 US-07 polling cadence)', () => {
  it('stops polling once the engram is enriched', () => {
    expect(refetchInterval(0, true)).toBe(false);
    expect(refetchInterval(60_000, true)).toBe(false);
  });

  it('polls every 1s during the first 10s', () => {
    expect(refetchInterval(0, false)).toBe(1000);
    expect(refetchInterval(5000, false)).toBe(1000);
    expect(refetchInterval(9999, false)).toBe(1000);
  });

  it('polls every 5s for the next 30s', () => {
    expect(refetchInterval(10_000, false)).toBe(5000);
    expect(refetchInterval(25_000, false)).toBe(5000);
    expect(refetchInterval(39_999, false)).toBe(5000);
  });

  it('stops polling after the slow window expires', () => {
    expect(refetchInterval(40_000, false)).toBe(false);
    expect(refetchInterval(60_000, false)).toBe(false);
  });
});

describe('hasStoppedPolling', () => {
  it('returns false while still inside the polling window', () => {
    expect(hasStoppedPolling(0, false)).toBe(false);
    expect(hasStoppedPolling(39_999, false)).toBe(false);
  });

  it('returns true once the slow window has elapsed and the engram is not enriched', () => {
    expect(hasStoppedPolling(40_000, false)).toBe(true);
  });

  it('returns false when the engram is enriched, regardless of elapsed time', () => {
    expect(hasStoppedPolling(60_000, true)).toBe(false);
  });
});

describe('replaceScope', () => {
  it('replaces only the targeted scope', () => {
    expect(replaceScope(['a.b', 'c.d'], 'a.b', 'x.y')).toEqual(['x.y', 'c.d']);
  });

  it('deduplicates when the canonical already exists', () => {
    expect(replaceScope(['x.y', 'a.b'], 'a.b', 'x.y')).toEqual(['x.y']);
  });

  it('is a no-op when the original is not present', () => {
    expect(replaceScope(['a.b'], 'missing', 'x.y')).toEqual(['a.b']);
  });
});

describe('segmentSetKey', () => {
  it('produces the same key regardless of segment order', () => {
    expect(segmentSetKey('work.karbon.fedx.meetings')).toBe(
      segmentSetKey('meetings.fedx.karbon.work')
    );
  });
});

describe('appendUnique', () => {
  it('appends a new value', () => {
    expect(appendUnique(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('does nothing when the value is already present', () => {
    expect(appendUnique(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });
});
