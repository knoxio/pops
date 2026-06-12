import { describe, expect, it } from 'vitest';

import { CONTRACTS, findContract, isEnrolled } from '../contract-list.js';

describe('CONTRACTS registry', () => {
  it('includes finance as the pilot', () => {
    expect(CONTRACTS.find((c) => c.pillar === 'finance')).toBeDefined();
  });

  it('produces a tag prefix matching the PRD format', () => {
    const finance = CONTRACTS.find((c) => c.pillar === 'finance');
    expect(finance?.tagPrefix).toBe('contract-finance@v');
  });

  it('produces a package name and dir consistent with the workspace layout', () => {
    for (const c of CONTRACTS) {
      expect(c.packageName).toBe(`@pops/${c.pillar}-contract`);
      expect(c.packageDir).toBe(`packages/${c.pillar}-contract`);
    }
  });

  it('findContract returns the entry when enrolled', () => {
    expect(findContract('finance')?.pillar).toBe('finance');
  });

  it('findContract returns undefined for a known pillar that is not enrolled', () => {
    expect(findContract('media')).toBeUndefined();
  });

  it('isEnrolled is a type guard over PILLARS', () => {
    expect(isEnrolled('finance')).toBe(true);
    expect(isEnrolled('media')).toBe(false);
    expect(isEnrolled('mystery')).toBe(false);
  });
});
