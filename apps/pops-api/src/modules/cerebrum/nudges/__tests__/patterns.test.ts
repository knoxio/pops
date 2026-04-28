import { describe, expect, it } from 'vitest';

import { PatternDetector } from '../detectors/patterns.js';

import type { EngramSummary, NudgeThresholds } from '../types.js';

function makeEngram(id: string, overrides: Partial<EngramSummary> = {}): EngramSummary {
  return {
    id,
    type: overrides.type ?? 'note',
    title: overrides.title ?? `Engram ${id}`,
    scopes: overrides.scopes ?? ['work.projects'],
    tags: overrides.tags ?? ['general'],
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? '2026-04-01T10:00:00Z',
    modifiedAt: overrides.modifiedAt ?? '2026-04-15T10:00:00Z',
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

/** Fixed "now" — 2026-04-27 (within the default 30-day window for all test engrams). */
const NOW = new Date('2026-04-27T10:00:00Z');
const fixedNow = () => NOW;

describe('PatternDetector', () => {
  it('detects recurring topics from tag frequency', () => {
    const engrams = Array.from({ length: 6 }, (_, i) =>
      makeEngram(`eng_${i + 1}`, {
        tags: ['agent-coordination', 'engineering'],
        createdAt: `2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      })
    );

    const detector = new PatternDetector(defaultThresholds(), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges.length).toBeGreaterThanOrEqual(1);
    const agentNudge = result.nudges.find((n) => n.title.includes('agent-coordination'));
    expect(agentNudge).toBeDefined();
    expect(agentNudge?.type).toBe('pattern');
    expect(agentNudge?.engramIds).toHaveLength(6);
  });

  it('does not flag topics below minimum occurrences', () => {
    const engrams = [
      makeEngram('eng_1', { tags: ['rare-topic'] }),
      makeEngram('eng_2', { tags: ['rare-topic'] }),
      makeEngram('eng_3', { tags: ['another-topic'] }),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(0);
  });

  it('respects configurable minimum occurrences', () => {
    const engrams = [
      makeEngram('eng_1', { tags: ['micro-topic'] }),
      makeEngram('eng_2', { tags: ['micro-topic'] }),
      makeEngram('eng_3', { tags: ['micro-topic'] }),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 3 }), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.title).toContain('micro-topic');
  });

  it('detects emerging themes with rising trend', () => {
    // Create engrams over 3 months with accelerating frequency.
    const month1 = Array.from({ length: 2 }, (_, i) =>
      makeEngram(`eng_m1_${i}`, {
        tags: ['accelerating-topic'],
        createdAt: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      })
    );
    const month2 = Array.from({ length: 5 }, (_, i) =>
      makeEngram(`eng_m2_${i}`, {
        tags: ['accelerating-topic'],
        createdAt: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      })
    );
    const month3 = Array.from({ length: 10 }, (_, i) =>
      makeEngram(`eng_m3_${i}`, {
        tags: ['accelerating-topic'],
        createdAt: `2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      })
    );

    const engrams = [...month1, ...month2, ...month3];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = detector.detect(engrams);

    // Should detect the recurring topic within the window AND/OR the emerging trend.
    expect(result.nudges.length).toBeGreaterThanOrEqual(1);

    // The trend direction should be 'rising' for the recurring pattern.
    const accelNudge = result.nudges.find((n) => n.title.includes('accelerating-topic'));
    expect(accelNudge).toBeDefined();
    expect(accelNudge?.body).toContain('rising');
  });

  it('excludes archived and consolidated engrams', () => {
    const engrams = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEngram(`eng_active_${i}`, {
          tags: ['test-tag'],
          status: 'active',
        })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEngram(`eng_archived_${i}`, {
          tags: ['test-tag'],
          status: 'archived',
        })
      ),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    // Should only include active engrams.
    for (const nudge of result.nudges) {
      expect(nudge.engramIds.every((id) => id.startsWith('eng_active'))).toBe(true);
    }
  });

  it('returns empty for no engrams', () => {
    const detector = new PatternDetector(defaultThresholds(), fixedNow);
    const result = detector.detect([]);

    expect(result.nudges).toHaveLength(0);
  });

  it('assigns medium priority to recurring and emerging patterns', () => {
    const engrams = Array.from({ length: 6 }, (_, i) =>
      makeEngram(`eng_${i}`, { tags: ['priority-test'] })
    );

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = detector.detect(engrams);

    for (const nudge of result.nudges) {
      expect(nudge.priority).toBe('medium');
    }
  });

  it('includes link action with topic and engram IDs', () => {
    const engrams = Array.from({ length: 5 }, (_, i) =>
      makeEngram(`eng_${i}`, { tags: ['action-test-topic'] })
    );

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.action?.type).toBe('link');
    expect(result.nudges[0]?.action?.params).toHaveProperty('topic', 'action-test-topic');
    expect(result.nudges[0]?.action?.params).toHaveProperty('engramIds');
  });

  it('handles engrams with multiple tags — counts each independently', () => {
    const engrams = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEngram(`eng_multi_${i}`, { tags: ['tag-a', 'tag-b'] })
      ),
      ...Array.from({ length: 3 }, (_, i) => makeEngram(`eng_single_${i}`, { tags: ['tag-a'] })),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = detector.detect(engrams);

    const tagANudge = result.nudges.find((n) => n.title.includes('tag-a'));
    const tagBNudge = result.nudges.find((n) => n.title.includes('tag-b'));

    // tag-a appears in 8 engrams, tag-b in 5.
    expect(tagANudge).toBeDefined();
    expect(tagBNudge).toBeDefined();
    expect(tagANudge?.engramIds.length).toBe(8);
    expect(tagBNudge?.engramIds.length).toBe(5);
  });

  it('only considers engrams within the rolling window for recurring detection', () => {
    const engrams = [
      // These are outside the 30-day window from 2026-04-27.
      ...Array.from({ length: 5 }, (_, i) =>
        makeEngram(`eng_old_${i}`, {
          tags: ['old-topic'],
          createdAt: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        })
      ),
      // Only 2 within the window.
      makeEngram('eng_new_1', {
        tags: ['old-topic'],
        createdAt: '2026-04-15T10:00:00Z',
      }),
      makeEngram('eng_new_2', {
        tags: ['old-topic'],
        createdAt: '2026-04-20T10:00:00Z',
      }),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = detector.detect(engrams);

    // Only 2 within the window for recurring — below threshold.
    // But emerging trend detection uses all-time data, so it may find it.
    // With 7 total and threshold 5, the topic should still appear if trend is rising.
    const oldTopicNudge = result.nudges.find((n) => n.title.includes('old-topic'));
    // The recurring detection should not fire (only 2 in window).
    // Emerging detection: 5 in Feb, 2 in Apr — that's declining, not rising.
    // So no nudge expected.
    expect(oldTopicNudge).toBeUndefined();
  });
});
