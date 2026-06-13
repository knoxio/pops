import { describe, expect, it } from 'vitest';

import { resolveInstalledIds } from './install-set.js';

describe('resolveInstalledIds', () => {
  const known = ['ai', 'cerebrum', 'core', 'finance', 'inventory', 'media'] as const;

  it('returns every known id when POPS_APPS and POPS_OVERLAYS are both unset', () => {
    expect(resolveInstalledIds(known, {})).toEqual(known);
  });

  it('intersects POPS_APPS with known ids and preserves source order', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: 'finance,inventory' })).toEqual([
      'finance',
      'inventory',
    ]);
  });

  it('unions POPS_APPS with POPS_OVERLAYS', () => {
    const knownPlusEgo = [...known, 'ego'] as const;
    expect(
      resolveInstalledIds(knownPlusEgo, { POPS_APPS: 'finance', POPS_OVERLAYS: 'ego' })
    ).toEqual(['finance', 'ego']);
  });

  it('drops unknown ids from POPS_APPS silently', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: 'finance,not-real' })).toEqual(['finance']);
  });

  it('treats whitespace-only env values as empty', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: '   ', POPS_OVERLAYS: '' })).toEqual([]);
  });

  it('keeps alwaysInstalled ids even when POPS_APPS would exclude them', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: 'finance' }, ['core'])).toEqual([
      'core',
      'finance',
    ]);
  });

  it('ignores alwaysInstalled when no env restrictions are active', () => {
    expect(resolveInstalledIds(known, {}, ['finance'])).toEqual(known);
  });

  it('trims whitespace around CSV entries', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: '  finance , inventory  ' })).toEqual([
      'finance',
      'inventory',
    ]);
  });

  it('drops empty CSV entries from trailing commas', () => {
    expect(resolveInstalledIds(known, { POPS_APPS: 'finance,,inventory,' })).toEqual([
      'finance',
      'inventory',
    ]);
  });
});
