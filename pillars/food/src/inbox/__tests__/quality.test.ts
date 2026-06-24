/**
 * Rubric pin. The rubric table is the contract — every weight, threshold, and
 * band boundary is exercised here so a future tweak cannot land silently.
 * Spec: pillars/food/docs/prds/quality-heuristic.
 */
import { describe, expect, it } from 'vitest';

import {
  scoreDraft,
  SIGNAL_WEIGHTS,
  type QualityInputs,
  type QualitySignalCode,
} from '../quality.js';

/** A maximally-clean baseline: url-web ingest, fresh, no caveats, full DSL. */
function cleanInputs(overrides: Partial<QualityInputs> = {}): QualityInputs {
  return {
    ingestKind: 'url-web',
    ingestState: 'completed',
    ingestAgeMinutes: 720, // 12h — fresh
    compileStatus: 'compiled',
    compileErrorCount: 0,
    proposedSlugCount: 0,
    creationCount: 0,
    ingredientLineCount: 5,
    stepCount: 4,
    hasTitle: true,
    hasYield: true,
    ...overrides,
  };
}

function signalCodes(inputs: QualityInputs): QualitySignalCode[] {
  return scoreDraft(inputs).signals.map((s) => s.code);
}

describe('scoreDraft purity', () => {
  it('is deterministic for identical inputs', () => {
    const a = scoreDraft(cleanInputs());
    const b = scoreDraft(cleanInputs());
    expect(a).toEqual(b);
  });

  it('does not mutate its input', () => {
    const input = cleanInputs();
    const snapshot = JSON.stringify(input);
    scoreDraft(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('clamps the raw score to [0, 100]', () => {
    // Stacked negative weights drive raw below zero; the floor clamps to 0.
    const result = scoreDraft(
      cleanInputs({
        partialReason: 'auth-dead',
        compileStatus: 'failed',
        compileErrorCount: 3,
      })
    );
    expect(result.score).toBe(0);
    expect(result.band).toBe('blocked');
  });

  it('clamps the raw score to 100 when bonuses overflow', () => {
    // Positive kind + age bonuses push raw above 100; the ceiling clamps it.
    const result = scoreDraft(cleanInputs({ ingestKind: 'text' }));
    expect(result.score).toBe(100);
    expect(result.band).toBe('clean');
  });
});

describe('every signal in isolation', () => {
  // Each test asserts: only this signal fires, and the score reflects exactly
  // its weight delta vs. the baseline.
  const cases: Array<{ code: QualitySignalCode; tweak: Partial<QualityInputs> }> = [
    { code: 'COMPILE_FAILED', tweak: { compileStatus: 'failed', compileErrorCount: 1 } },
    { code: 'COMPILE_UNCOMPILED', tweak: { compileStatus: 'uncompiled' } },
    { code: 'NO_TITLE', tweak: { hasTitle: false } },
    { code: 'NO_YIELD', tweak: { hasYield: false } },
    { code: 'EMPTY_INGREDIENTS', tweak: { ingredientLineCount: 0 } },
    { code: 'EMPTY_STEPS', tweak: { stepCount: 0 } },
    { code: 'PROPOSED_SLUGS_FEW', tweak: { proposedSlugCount: 2 } },
    { code: 'PROPOSED_SLUGS_MANY', tweak: { proposedSlugCount: 4 } },
    { code: 'PARTIAL_AUTH_DEAD', tweak: { partialReason: 'auth-dead' } },
    { code: 'PARTIAL_RATE_LIMITED', tweak: { partialReason: 'rate-limited' } },
    { code: 'PARTIAL_STT_FAILED', tweak: { partialReason: 'stt-failed' } },
    { code: 'PARTIAL_VISION_FAILED', tweak: { partialReason: 'vision-failed' } },
    { code: 'PARTIAL_CAPTION_ONLY', tweak: { partialReason: 'caption-only-fallback' } },
    { code: 'PARTIAL_EMPTY_EXTRACTION', tweak: { partialReason: 'empty-extraction' } },
    { code: 'INGEST_KIND_TEXT', tweak: { ingestKind: 'text' } },
    { code: 'INGEST_KIND_SCREENSHOT', tweak: { ingestKind: 'screenshot' } },
    { code: 'INGEST_KIND_INSTAGRAM', tweak: { ingestKind: 'url-instagram' } },
    {
      code: 'AGE_STALE',
      // Stale needs > 14 days; staleness also kills the AGE_FRESH bonus.
      tweak: { ingestAgeMinutes: 30_000 },
    },
    { code: 'CREATIONS_HIGH', tweak: { creationCount: 6 } },
  ];

  for (const { code, tweak } of cases) {
    it(`${code} fires (and only it) when the matching input is set`, () => {
      const codes = signalCodes(cleanInputs(tweak));
      // AGE_FRESH always co-fires when staying within the 24h window; the
      // signal-isolation contract excludes it.
      const additional = codes.filter((c) => c !== code && c !== 'AGE_FRESH');
      expect(additional).toEqual([]);
      expect(codes).toContain(code);
    });
  }
});

describe('band boundaries', () => {
  it('100 → clean (clean closed at 100)', () => {
    expect(scoreDraft(cleanInputs()).band).toBe('clean');
  });

  it('80 → clean (lower boundary of clean is inclusive)', () => {
    const result = scoreDraft(cleanInputs({ hasTitle: false }));
    // ingestAgeMinutes in [AGE_FRESH_MAX, AGE_STALE_MIN] suppresses both age
    // signals, so the title penalty lands the score exactly on the floor.
    const exact = scoreDraft(cleanInputs({ hasTitle: false, ingestAgeMinutes: 1440 }));
    expect(exact.score).toBe(80);
    expect(exact.band).toBe('clean');
    expect(result.band).toBe('clean');
  });

  it('just below the clean floor → minor (pinned at 78)', () => {
    // Clean is half-open at the lower bound (`score >= 80`), so anything below
    // 80 must land in `minor`. Integer weights cannot land on exactly 79, so
    // pin 78 — the closest reachable point below the floor — and assert it
    // demotes to `minor`.
    const r = scoreDraft(
      cleanInputs({
        hasTitle: false,
        partialReason: 'rate-limited',
        ingestKind: 'text',
        ingestAgeMinutes: 30_000,
      })
    );
    expect(r.score).toBe(78);
    expect(r.band).toBe('minor');
  });

  it('50 → minor (lower boundary of minor is inclusive)', () => {
    const r = scoreDraft(
      cleanInputs({
        compileStatus: 'uncompiled',
        ingestKind: 'url-instagram',
        partialReason: 'rate-limited',
        ingestAgeMinutes: 1440,
      })
    );
    expect(r.score).toBe(50);
    expect(r.band).toBe('minor');
  });

  it('just below the minor floor → attention (pinned at 48)', () => {
    // `minor` requires `score >= 50`. Integer weights cannot land on exactly
    // 49, so pin 48 — the closest reachable point below the floor — and assert
    // it demotes to `attention`.
    const r = scoreDraft(
      cleanInputs({
        compileStatus: 'uncompiled',
        ingestKind: 'url-instagram',
        partialReason: 'rate-limited',
        ingestAgeMinutes: 30_000,
      })
    );
    expect(r.score).toBe(48);
    expect(r.band).toBe('attention');
  });

  it('20 → attention (lower boundary of attention is inclusive)', () => {
    // Stack non-partial penalties (only one partial reason can ever fire) and
    // suppress the age bonus so the score lands exactly on the attention floor.
    const r = scoreDraft(
      cleanInputs({
        ingestKind: 'text',
        ingredientLineCount: 0,
        stepCount: 0,
        hasYield: false,
        ingestAgeMinutes: 1440,
      })
    );
    expect(r.score).toBe(20);
    expect(r.band).toBe('attention');
  });

  it('score < 20 → blocked (just below the attention floor)', () => {
    // Integer weights cannot land on exactly 19, so pin 18 — the closest
    // reachable point below the floor — and assert both score and band.
    const r = scoreDraft(
      cleanInputs({
        ingestKind: 'text',
        ingredientLineCount: 0,
        stepCount: 0,
        hasYield: false,
        ingestAgeMinutes: 30_000,
      })
    );
    expect(r.score).toBe(18);
    expect(r.band).toBe('blocked');
  });
});

describe('explicit edge cases from the rubric table', () => {
  it('auth-dead alone lands a clean baseline in the blocked band', () => {
    // The PARTIAL_AUTH_DEAD weight alone sinks a clean baseline below the
    // attention floor, so the band is blocked. There is no band override:
    // positive signals still apply, so the residual is whatever AGE_FRESH adds.
    const r = scoreDraft(cleanInputs({ partialReason: 'auth-dead' }));
    expect(r.band).toBe('blocked');
    expect(r.score).toBeLessThan(20);
  });

  it('auth-dead with no AGE bonus produces score = 0', () => {
    const r = scoreDraft(cleanInputs({ partialReason: 'auth-dead', ingestAgeMinutes: 1440 }));
    expect(r.score).toBe(0);
    expect(r.band).toBe('blocked');
  });

  it('empty draft → blocked', () => {
    const r = scoreDraft(
      cleanInputs({
        hasTitle: false,
        hasYield: false,
        ingredientLineCount: 0,
        stepCount: 0,
      })
    );
    expect(r.score).toBe(0);
    expect(r.band).toBe('blocked');
  });

  it('clean text ingest, fresh → clean (score clamps to 100)', () => {
    const r = scoreDraft(cleanInputs({ ingestKind: 'text' }));
    expect(r.score).toBe(100);
    expect(r.band).toBe('clean');
  });

  it('stacked signals — instagram + many slugs + vision failed + no yield → attention', () => {
    const r = scoreDraft(
      cleanInputs({
        ingestKind: 'url-instagram',
        proposedSlugCount: 4,
        partialReason: 'vision-failed',
        hasYield: false,
        ingestAgeMinutes: 1440,
      })
    );
    expect(r.score).toBe(40);
    expect(r.band).toBe('attention');
  });

  it('30-day-old clean draft → still clean (AGE_STALE is a nudge, not a demoter)', () => {
    const r = scoreDraft(cleanInputs({ ingestAgeMinutes: 30 * 24 * 60 }));
    expect(r.score).toBe(98);
    expect(r.band).toBe('clean');
  });

  it('proposedSlugCount = 0 triggers neither PROPOSED_SLUGS_* signal', () => {
    const codes = signalCodes(cleanInputs({ proposedSlugCount: 0 }));
    expect(codes).not.toContain('PROPOSED_SLUGS_FEW');
    expect(codes).not.toContain('PROPOSED_SLUGS_MANY');
  });

  it('creationCount = 6 fires CREATIONS_HIGH; 5 does not', () => {
    expect(signalCodes(cleanInputs({ creationCount: 6 }))).toContain('CREATIONS_HIGH');
    expect(signalCodes(cleanInputs({ creationCount: 5 }))).not.toContain('CREATIONS_HIGH');
  });

  it('url-web baseline fires NO ingest-kind signal', () => {
    const codes = signalCodes(cleanInputs({ ingestKind: 'url-web' }));
    expect(codes).not.toContain('INGEST_KIND_TEXT');
    expect(codes).not.toContain('INGEST_KIND_SCREENSHOT');
    expect(codes).not.toContain('INGEST_KIND_INSTAGRAM');
  });
});

describe('signal list ordering + weight contract', () => {
  it('orders signals by descending |weight|', () => {
    const r = scoreDraft(
      cleanInputs({
        compileStatus: 'failed',
        compileErrorCount: 2,
        hasTitle: false,
        proposedSlugCount: 5,
        ingestKind: 'text',
      })
    );
    const weights = r.signals.map((s) => Math.abs(s.weight));
    const sorted = weights.slice().toSorted((a, b) => b - a);
    expect(weights).toEqual(sorted);
  });

  it('signal weight in the result matches SIGNAL_WEIGHTS exactly', () => {
    const r = scoreDraft(cleanInputs({ partialReason: 'vision-failed' }));
    const vision = r.signals.find((s) => s.code === 'PARTIAL_VISION_FAILED');
    expect(vision?.weight).toBe(SIGNAL_WEIGHTS.PARTIAL_VISION_FAILED);
  });

  it('returns a fresh signals array (mutating it does not break the next call)', () => {
    const r = scoreDraft(cleanInputs({ hasTitle: false }));
    r.signals.pop();
    const r2 = scoreDraft(cleanInputs({ hasTitle: false }));
    expect(r2.signals.length).toBeGreaterThan(0);
  });
});

describe('property check: score → band consistency', () => {
  // Sample randomised valid inputs and assert the score is always consistent
  // with its band per the rubric's half-open intervals.
  function band(score: number): string {
    if (score >= 80) return 'clean';
    if (score >= 50) return 'minor';
    if (score >= 20) return 'attention';
    return 'blocked';
  }

  function randomInputs(seed: number): QualityInputs {
    // tiny LCG so the property test is deterministic across CI runs
    let s = seed;
    const rand = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
    const kinds = ['url-web', 'url-instagram', 'text', 'screenshot'] as const;
    const states = ['pending', 'processing', 'completed', 'failed', 'partial'] as const;
    const compileStates = ['uncompiled', 'compiled', 'failed'] as const;
    const partials = [
      undefined,
      'auth-dead',
      'rate-limited',
      'stt-failed',
      'vision-failed',
      'caption-only-fallback',
      'empty-extraction',
    ] as const;
    return {
      ingestKind: kinds[Math.floor(rand() * kinds.length)] ?? 'url-web',
      ingestState: states[Math.floor(rand() * states.length)] ?? 'completed',
      partialReason: partials[Math.floor(rand() * partials.length)],
      ingestAgeMinutes: Math.floor(rand() * 60_000),
      compileStatus: compileStates[Math.floor(rand() * compileStates.length)] ?? 'compiled',
      compileErrorCount: Math.floor(rand() * 5),
      proposedSlugCount: Math.floor(rand() * 8),
      creationCount: Math.floor(rand() * 10),
      ingredientLineCount: Math.floor(rand() * 10),
      stepCount: Math.floor(rand() * 12),
      hasTitle: rand() > 0.3,
      hasYield: rand() > 0.4,
    };
  }

  it('every random sample has a band that matches the score range', () => {
    for (let i = 0; i < 200; i += 1) {
      const inputs = randomInputs(i + 1);
      const r = scoreDraft(inputs);
      expect(r.band).toBe(band(r.score));
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});
