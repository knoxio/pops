import { describe, expect, it } from 'vitest';

import { bump, classifyBump, compareSemver, parseSemver, stringifySemver } from '../semver.js';

describe('parseSemver', () => {
  it('parses strict X.Y.Z triples', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
  });

  it('rejects pre-release suffixes', () => {
    expect(() => parseSemver('1.0.0-alpha')).toThrow(/invalid semver/);
  });

  it('rejects missing components', () => {
    expect(() => parseSemver('1.2')).toThrow(/invalid semver/);
    expect(() => parseSemver('1')).toThrow(/invalid semver/);
  });
});

describe('stringifySemver', () => {
  it('round-trips parse → stringify', () => {
    expect(stringifySemver(parseSemver('4.5.6'))).toBe('4.5.6');
  });
});

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver(parseSemver('1.2.3'), parseSemver('1.2.3'))).toBe(0);
  });

  it('orders by major first', () => {
    expect(compareSemver(parseSemver('1.99.99'), parseSemver('2.0.0'))).toBe(-1);
    expect(compareSemver(parseSemver('2.0.0'), parseSemver('1.99.99'))).toBe(1);
  });

  it('orders by minor when major equal', () => {
    expect(compareSemver(parseSemver('1.2.99'), parseSemver('1.3.0'))).toBe(-1);
  });

  it('orders by patch when major and minor equal', () => {
    expect(compareSemver(parseSemver('1.2.3'), parseSemver('1.2.4'))).toBe(-1);
  });
});

describe('bump', () => {
  const baseline = parseSemver('1.4.2');

  it('returns baseline for none', () => {
    expect(bump(baseline, 'none')).toEqual(baseline);
  });

  it('bumps patch', () => {
    expect(stringifySemver(bump(baseline, 'patch'))).toBe('1.4.3');
  });

  it('bumps minor and zeroes patch', () => {
    expect(stringifySemver(bump(baseline, 'minor'))).toBe('1.5.0');
  });

  it('bumps major and zeroes minor + patch', () => {
    expect(stringifySemver(bump(baseline, 'major'))).toBe('2.0.0');
  });
});

describe('classifyBump', () => {
  it('detects no bump', () => {
    expect(classifyBump(parseSemver('1.2.3'), parseSemver('1.2.3'))).toBe('none');
  });
  it('detects patch bump', () => {
    expect(classifyBump(parseSemver('1.2.3'), parseSemver('1.2.4'))).toBe('patch');
  });
  it('detects minor bump', () => {
    expect(classifyBump(parseSemver('1.2.3'), parseSemver('1.3.0'))).toBe('minor');
  });
  it('detects major bump', () => {
    expect(classifyBump(parseSemver('1.2.3'), parseSemver('2.0.0'))).toBe('major');
  });
  it('rejects regressions', () => {
    expect(() => classifyBump(parseSemver('1.2.3'), parseSemver('1.2.2'))).toThrow(/regresses/);
    expect(() => classifyBump(parseSemver('1.2.3'), parseSemver('1.1.9'))).toThrow(/regresses/);
    expect(() => classifyBump(parseSemver('2.0.0'), parseSemver('1.9.9'))).toThrow(/downgrades/);
  });
});
