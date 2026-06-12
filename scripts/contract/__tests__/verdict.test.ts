import { describe, expect, it } from 'vitest';

import { computeVerdict } from '../verdict.js';

import type { SurfaceDiff } from '../types.js';

const noneDiff: SurfaceDiff = { kind: 'none', added: [], removed: [], changed: [] };
const additiveDiff: SurfaceDiff = { kind: 'additive', added: ['X'], removed: [], changed: [] };
const breakingDiff: SurfaceDiff = { kind: 'breaking', added: [], removed: ['Y'], changed: [] };

describe('computeVerdict — initial version (no baseline)', () => {
  it('passes regardless of declared version', () => {
    expect(
      computeVerdict({
        baselineVersion: null,
        currentVersion: '0.1.0',
        tsDiff: noneDiff,
        zodDiff: noneDiff,
      }).verdict
    ).toBe('pass-initial-version');
  });
});

describe('computeVerdict — no diff', () => {
  it('passes when version unchanged', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.4.2',
      tsDiff: noneDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('pass-no-change');
    expect(v.classification).toBe('none');
  });

  it('passes (advisory) when version bumped with no diff', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.4.3',
      tsDiff: noneDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('pass-no-change');
    expect(v.reason).toMatch(/consider not bumping/);
  });
});

describe('computeVerdict — additive diff', () => {
  it('fails when version unchanged', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.4.2',
      tsDiff: additiveDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('fail-bump-required');
    expect(v.requiredVersion).toBe('1.5.0');
  });

  it('passes when minor bump declared', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.5.0',
      tsDiff: additiveDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('pass-bumped-correctly');
  });

  it('fails when patch bump declared but minor required', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.4.3',
      tsDiff: additiveDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('fail-bump-too-small');
  });

  it('fails when major bump declared but minor would suffice', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '2.0.0',
      tsDiff: additiveDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('fail-bump-too-large');
  });
});

describe('computeVerdict — breaking diff', () => {
  it('fails when version unchanged', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.4.2',
      tsDiff: breakingDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('fail-bump-required');
    expect(v.requiredVersion).toBe('2.0.0');
  });

  it('fails when minor bump declared but major required', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.5.0',
      tsDiff: breakingDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('fail-bump-too-small');
  });

  it('passes when major bump declared', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '2.0.0',
      tsDiff: breakingDiff,
      zodDiff: noneDiff,
    });
    expect(v.verdict).toBe('pass-bumped-correctly');
  });

  it('still requires major when Zod is breaking but TS is none', () => {
    const v = computeVerdict({
      baselineVersion: '1.4.2',
      currentVersion: '1.4.2',
      tsDiff: noneDiff,
      zodDiff: breakingDiff,
    });
    expect(v.verdict).toBe('fail-bump-required');
    expect(v.requiredVersion).toBe('2.0.0');
  });
});
