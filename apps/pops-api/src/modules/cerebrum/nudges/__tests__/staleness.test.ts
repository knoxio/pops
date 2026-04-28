import { describe, expect, it } from 'vitest';

import { StalenessDetector } from '../detectors/staleness.js';

import type { EngramSummary, NudgeThresholds } from '../types.js';

function makeEngram(id: string, overrides: Partial<EngramSummary> = {}): EngramSummary {
  return {
    id,
    type: overrides.type ?? 'note',
    title: overrides.title ?? `Engram ${id}`,
    scopes: overrides.scopes ?? ['work.projects'],
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? '2026-01-01T10:00:00Z',
    modifiedAt: overrides.modifiedAt ?? '2026-01-15T10:00:00Z',
  };
}

function defaultThresholds(overrides: Partial<NudgeThresholds> = {}): NudgeThresholds {
  return {
    consolidationSimilarity: 0.85,
    consolidationMinCluster: 3,
    stalenessDays: 90,
    patternMinOccurrences: 5,
    maxPendingNudges: 20,
    nudgeCooldownHours: 24,
    ...overrides,
  };
}

/** Fixed "now" — 2026-04-27. */
const NOW = new Date('2026-04-27T10:00:00Z');
const fixedNow = () => NOW;

describe('StalenessDetector', () => {
  it('flags engrams older than the staleness threshold', () => {
    const engrams = [
      makeEngram('eng_1', { modifiedAt: '2026-01-01T10:00:00Z' }), // 116 days old
      makeEngram('eng_2', { modifiedAt: '2026-04-20T10:00:00Z' }), // 7 days old
    ];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.engramIds).toEqual(['eng_1']);
    expect(result.nudges[0]?.type).toBe('staleness');
  });

  it('respects configurable staleness threshold', () => {
    const engrams = [
      makeEngram('eng_1', { modifiedAt: '2026-03-28T10:00:00Z' }), // 30 days old
      makeEngram('eng_2', { modifiedAt: '2026-04-20T10:00:00Z' }), // 7 days old
    ];

    const detector = new StalenessDetector(defaultThresholds({ stalenessDays: 14 }), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.engramIds).toEqual(['eng_1']);
  });

  it('excludes archived engrams', () => {
    const engrams = [
      makeEngram('eng_1', { modifiedAt: '2025-01-01T10:00:00Z', status: 'archived' }),
      makeEngram('eng_2', { modifiedAt: '2025-01-01T10:00:00Z', status: 'active' }),
    ];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.engramIds).toEqual(['eng_2']);
  });

  it('excludes consolidated engrams', () => {
    const engrams = [
      makeEngram('eng_1', {
        modifiedAt: '2025-01-01T10:00:00Z',
        status: 'consolidated',
      }),
    ];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(0);
  });

  it('suppresses detection on fresh corpora (< 30 days)', () => {
    const engrams = [
      makeEngram('eng_1', {
        createdAt: '2026-04-10T10:00:00Z', // only 17 days old corpus
        modifiedAt: '2026-04-10T10:00:00Z',
      }),
      makeEngram('eng_2', {
        createdAt: '2026-04-15T10:00:00Z',
        modifiedAt: '2026-04-15T10:00:00Z',
      }),
    ];

    const detector = new StalenessDetector(defaultThresholds({ stalenessDays: 5 }), fixedNow);
    const result = detector.detect(engrams);

    // Even though eng_1 is 17 days old (> 5 day threshold),
    // the corpus is only 17 days old (< 30 day maturity).
    expect(result.nudges).toHaveLength(0);
  });

  it('allows detection when corpus is mature enough', () => {
    const engrams = [
      makeEngram('eng_1', {
        createdAt: '2026-01-01T10:00:00Z', // corpus is 116 days old
        modifiedAt: '2026-01-10T10:00:00Z', // 107 days since modification
      }),
      makeEngram('eng_2', {
        createdAt: '2026-04-20T10:00:00Z',
        modifiedAt: '2026-04-20T10:00:00Z', // 7 days old
      }),
    ];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.engramIds).toEqual(['eng_1']);
  });

  it('sorts results by age descending (stalest first)', () => {
    const engrams = [
      makeEngram('eng_1', { modifiedAt: '2026-01-15T10:00:00Z' }), // 102 days
      makeEngram('eng_2', { modifiedAt: '2025-12-01T10:00:00Z' }), // 147 days
      makeEngram('eng_3', { modifiedAt: '2026-01-25T10:00:00Z' }), // 92 days
    ];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(3);
    expect(result.nudges[0]?.engramIds).toEqual(['eng_2']); // stalest
    expect(result.nudges[1]?.engramIds).toEqual(['eng_1']);
    expect(result.nudges[2]?.engramIds).toEqual(['eng_3']); // least stale
  });

  it('assigns correct priority based on staleness severity', () => {
    const engrams = [
      makeEngram('eng_low', { modifiedAt: '2026-01-25T10:00:00Z' }), // ~92 days (< 180) -> low
      makeEngram('eng_med', { modifiedAt: '2025-10-10T10:00:00Z' }), // ~199 days (> 180, < 270) -> medium
      makeEngram('eng_high', { modifiedAt: '2025-06-01T10:00:00Z' }), // ~330 days (> 270) -> high
    ];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(3);
    const byId = new Map(result.nudges.map((n) => [n.engramIds[0], n]));
    expect(byId.get('eng_low')?.priority).toBe('low');
    expect(byId.get('eng_med')?.priority).toBe('medium');
    expect(byId.get('eng_high')?.priority).toBe('high');
  });

  it('returns empty for no engrams', () => {
    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect([]);

    expect(result.nudges).toHaveLength(0);
  });

  it('includes action with review suggestion', () => {
    const engrams = [makeEngram('eng_1', { modifiedAt: '2026-01-01T10:00:00Z' })];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges[0]?.action).toEqual({
      type: 'review',
      label: 'Mark as reviewed',
      params: { engramId: 'eng_1' },
    });
  });

  it('includes scope and type info in the nudge body', () => {
    const engrams = [
      makeEngram('eng_1', {
        modifiedAt: '2026-01-01T10:00:00Z',
        type: 'decision',
        scopes: ['work.engineering'],
      }),
    ];

    const detector = new StalenessDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges[0]?.body).toContain('decision');
    expect(result.nudges[0]?.body).toContain('work.engineering');
  });
});
