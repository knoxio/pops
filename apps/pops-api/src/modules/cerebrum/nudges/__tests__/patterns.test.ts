import { describe, expect, it, vi } from 'vitest';

const loggerMock = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('../../../../lib/logger.js', () => ({ logger: loggerMock }));

const { PatternDetector } = await import('../detectors/patterns.js');

import type { ContradictionAnalyzer } from '../detectors/contradiction-analyzer.js';
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
  it('detects recurring topics from tag frequency', async () => {
    const engrams = Array.from({ length: 6 }, (_, i) =>
      makeEngram(`eng_${i + 1}`, {
        tags: ['agent-coordination', 'engineering'],
        createdAt: `2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      })
    );

    const detector = new PatternDetector(defaultThresholds(), fixedNow);
    const result = await detector.detect(engrams);

    expect(result.nudges.length).toBeGreaterThanOrEqual(1);
    const agentNudge = result.nudges.find((n) => n.title.includes('agent-coordination'));
    expect(agentNudge).toBeDefined();
    expect(agentNudge?.type).toBe('pattern');
    expect(agentNudge?.engramIds).toHaveLength(6);
  });

  it('does not flag topics below minimum occurrences', async () => {
    const engrams = [
      makeEngram('eng_1', { tags: ['rare-topic'] }),
      makeEngram('eng_2', { tags: ['rare-topic'] }),
      makeEngram('eng_3', { tags: ['another-topic'] }),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(0);
  });

  it('respects configurable minimum occurrences', async () => {
    const engrams = [
      makeEngram('eng_1', { tags: ['micro-topic'] }),
      makeEngram('eng_2', { tags: ['micro-topic'] }),
      makeEngram('eng_3', { tags: ['micro-topic'] }),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 3 }), fixedNow);
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.title).toContain('micro-topic');
  });

  it('detects emerging themes with rising trend', async () => {
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
    const result = await detector.detect(engrams);

    // Should detect the recurring topic within the window AND/OR the emerging trend.
    expect(result.nudges.length).toBeGreaterThanOrEqual(1);

    // The trend direction should be 'rising' for the recurring pattern.
    const accelNudge = result.nudges.find((n) => n.title.includes('accelerating-topic'));
    expect(accelNudge).toBeDefined();
    expect(accelNudge?.body).toContain('rising');
  });

  it('excludes archived and consolidated engrams', async () => {
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
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    // Should only include active engrams.
    for (const nudge of result.nudges) {
      expect(nudge.engramIds.every((id) => id.startsWith('eng_active'))).toBe(true);
    }
  });

  it('returns empty for no engrams', async () => {
    const detector = new PatternDetector(defaultThresholds(), fixedNow);
    const result = await detector.detect([]);

    expect(result.nudges).toHaveLength(0);
  });

  it('assigns medium priority to recurring and emerging patterns', async () => {
    const engrams = Array.from({ length: 6 }, (_, i) =>
      makeEngram(`eng_${i}`, { tags: ['priority-test'] })
    );

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = await detector.detect(engrams);

    for (const nudge of result.nudges) {
      expect(nudge.priority).toBe('medium');
    }
  });

  it('includes link action with topic and engram IDs', async () => {
    const engrams = Array.from({ length: 5 }, (_, i) =>
      makeEngram(`eng_${i}`, { tags: ['action-test-topic'] })
    );

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.action?.type).toBe('link');
    expect(result.nudges[0]?.action?.params).toHaveProperty('topic', 'action-test-topic');
    expect(result.nudges[0]?.action?.params).toHaveProperty('engramIds');
  });

  it('handles engrams with multiple tags — counts each independently', async () => {
    const engrams = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEngram(`eng_multi_${i}`, { tags: ['tag-a', 'tag-b'] })
      ),
      ...Array.from({ length: 3 }, (_, i) => makeEngram(`eng_single_${i}`, { tags: ['tag-a'] })),
    ];

    const detector = new PatternDetector(defaultThresholds({ patternMinOccurrences: 5 }), fixedNow);
    const result = await detector.detect(engrams);

    const tagANudge = result.nudges.find((n) => n.title.includes('tag-a'));
    const tagBNudge = result.nudges.find((n) => n.title.includes('tag-b'));

    // tag-a appears in 8 engrams, tag-b in 5.
    expect(tagANudge).toBeDefined();
    expect(tagBNudge).toBeDefined();
    expect(tagANudge?.engramIds.length).toBe(8);
    expect(tagBNudge?.engramIds.length).toBe(5);
  });

  it('only considers engrams within the rolling window for recurring detection', async () => {
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
    const result = await detector.detect(engrams);

    // Only 2 within the window for recurring — below threshold.
    // But emerging trend detection uses all-time data, so it may find it.
    // With 7 total and threshold 5, the topic should still appear if trend is rising.
    const oldTopicNudge = result.nudges.find((n) => n.title.includes('old-topic'));
    // The recurring detection should not fire (only 2 in window).
    // Emerging detection: 5 in Feb, 2 in Apr — that's declining, not rising.
    // So no nudge expected.
    expect(oldTopicNudge).toBeUndefined();
  });

  describe('contradiction detection', () => {
    it('emits a high-priority contradiction nudge with excerpts from both sides', async () => {
      const a = makeEngram('eng_friday_yes', {
        scopes: ['work.projects'],
        tags: ['topic:deploys'],
      });
      const b = makeEngram('eng_friday_no', {
        scopes: ['work.projects'],
        tags: ['topic:deploys'],
      });

      const bodies: Record<string, string> = {
        eng_friday_yes: 'We can deploy on Fridays without issue.',
        eng_friday_no: 'We must never deploy on Fridays.',
      };

      const analyzer: ContradictionAnalyzer = {
        analyze: async (engramA, _bodyA, engramB, _bodyB) => ({
          engramA,
          engramB,
          excerptA: 'We can deploy on Fridays',
          excerptB: 'never deploy on Fridays',
          conflict: 'A allows Friday deploys, B forbids them.',
        }),
      };

      const detector = new PatternDetector({
        thresholds: defaultThresholds({ patternMinOccurrences: 99 }),
        now: fixedNow,
        contradictionAnalyzer: analyzer,
        bodyReader: (id) => bodies[id] ?? null,
      });

      const result = await detector.detect([a, b]);

      const contradictionNudge = result.nudges.find((n) => n.title.startsWith('Contradiction'));
      expect(contradictionNudge).toBeDefined();
      expect(contradictionNudge?.priority).toBe('high');
      // Pair generation sorts engrams by ID so the order is deterministic.
      expect(contradictionNudge?.engramIds).toEqual(['eng_friday_no', 'eng_friday_yes']);
      expect(contradictionNudge?.body).toContain('We can deploy on Fridays');
      expect(contradictionNudge?.body).toContain('never deploy on Fridays');
      expect(contradictionNudge?.body).toContain('eng_friday_yes');
      expect(contradictionNudge?.body).toContain('eng_friday_no');
      expect(contradictionNudge?.action?.params).toHaveProperty('contradiction');
    });

    it('does NOT emit a contradiction nudge when the analyzer returns null', async () => {
      const a = makeEngram('eng_a', { scopes: ['work.projects'], tags: ['topic:agree'] });
      const b = makeEngram('eng_b', { scopes: ['work.projects'], tags: ['topic:agree'] });

      const detector = new PatternDetector({
        thresholds: defaultThresholds({ patternMinOccurrences: 99 }),
        now: fixedNow,
        contradictionAnalyzer: { analyze: async () => null },
        bodyReader: () => 'some body',
      });

      const result = await detector.detect([a, b]);
      const contradictionNudge = result.nudges.find((n) => n.title.startsWith('Contradiction'));
      expect(contradictionNudge).toBeUndefined();
    });

    it('skips pairs without shared tags (false-positive guard)', async () => {
      const a = makeEngram('eng_a', { scopes: ['work.projects'], tags: ['topic:alpha'] });
      const b = makeEngram('eng_b', { scopes: ['work.projects'], tags: ['topic:beta'] });

      const analyze = vi.fn();
      const detector = new PatternDetector({
        thresholds: defaultThresholds({ patternMinOccurrences: 99 }),
        now: fixedNow,
        contradictionAnalyzer: { analyze },
        bodyReader: () => 'body',
      });

      const result = await detector.detect([a, b]);
      expect(result.nudges).toHaveLength(0);
      expect(analyze).not.toHaveBeenCalled();
    });

    it('skips pairs spanning different top-level scopes', async () => {
      const a = makeEngram('eng_a', { scopes: ['work.projects'], tags: ['topic:shared'] });
      const b = makeEngram('eng_b', { scopes: ['personal.notes'], tags: ['topic:shared'] });

      const analyze = vi.fn();
      const detector = new PatternDetector({
        thresholds: defaultThresholds({ patternMinOccurrences: 99 }),
        now: fixedNow,
        contradictionAnalyzer: { analyze },
        bodyReader: () => 'body',
      });

      const result = await detector.detect([a, b]);
      expect(result.nudges).toHaveLength(0);
      expect(analyze).not.toHaveBeenCalled();
    });

    it('survives analyzer errors on individual pairs', async () => {
      const a = makeEngram('eng_a', { scopes: ['work.projects'], tags: ['topic:t1'] });
      const b = makeEngram('eng_b', { scopes: ['work.projects'], tags: ['topic:t1'] });
      const c = makeEngram('eng_c', { scopes: ['work.projects'], tags: ['topic:t1'] });

      let calls = 0;
      const analyzer: ContradictionAnalyzer = {
        analyze: async (engramA, _bodyA, engramB, _bodyB) => {
          calls++;
          if (calls === 1) throw new Error('LLM down');
          return {
            engramA,
            engramB,
            excerptA: 'a quote',
            excerptB: 'b quote',
            conflict: 'real conflict',
          };
        },
      };

      const detector = new PatternDetector({
        thresholds: defaultThresholds({ patternMinOccurrences: 99 }),
        now: fixedNow,
        contradictionAnalyzer: analyzer,
        bodyReader: () => 'body',
      });

      loggerMock.warn.mockClear();
      const result = await detector.detect([a, b, c]);
      // 3 pairs total; first throws, the remaining two should produce
      // nudges so the scan as a whole degrades gracefully.
      const contradictions = result.nudges.filter((n) => n.title.startsWith('Contradiction'));
      expect(contradictions.length).toBeGreaterThanOrEqual(1);

      // The swallowed per-pair error must be logged so silent regressions
      // are catchable in production telemetry.
      const errorWarnings = loggerMock.warn.mock.calls.filter(
        (call) => typeof call[1] === 'string' && call[1].includes('contradiction analyzer failed')
      );
      expect(errorWarnings).toHaveLength(1);
      const [warnCtx] = errorWarnings[0] ?? [];
      expect(warnCtx).toMatchObject({ engramA: expect.any(String), engramB: expect.any(String) });
    });

    it('falls back to noop analyzer when no analyzer is configured', async () => {
      const a = makeEngram('eng_a', { scopes: ['work.projects'], tags: ['topic:t1'] });
      const b = makeEngram('eng_b', { scopes: ['work.projects'], tags: ['topic:t1'] });

      // No analyzer, no bodyReader → contradiction pass is fully skipped.
      const detector = new PatternDetector(
        defaultThresholds({ patternMinOccurrences: 99 }),
        fixedNow
      );
      const result = await detector.detect([a, b]);
      expect(result.nudges).toHaveLength(0);
    });

    it('respects maxContradictionPairs cap', async () => {
      const engrams = Array.from({ length: 6 }, (_, i) =>
        makeEngram(`eng_${i}`, { scopes: ['work.projects'], tags: ['topic:t1'] })
      );

      const analyze = vi.fn().mockResolvedValue(null);
      const detector = new PatternDetector({
        thresholds: defaultThresholds({ patternMinOccurrences: 99 }),
        now: fixedNow,
        contradictionAnalyzer: { analyze },
        bodyReader: () => 'body',
        maxContradictionPairs: 3,
      });

      await detector.detect(engrams);
      // 6 engrams = 15 pairs; cap to 3.
      expect(analyze).toHaveBeenCalledTimes(3);
    });
  });
});
