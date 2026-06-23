import { describe, expect, expectTypeOf, it } from 'vitest';

import { type KnownPillarId, type PillarId, PILLARS } from '../known-pillar-id.js';
import { isKnownPillarId, type ModuleId } from '../module-id.js';

describe('isKnownPillarId', () => {
  it('returns true for every entry in the curated PILLARS value', () => {
    for (const pillar of PILLARS) {
      expect(isKnownPillarId(pillar)).toBe(true);
    }
  });

  it('returns true for ai (now a first-class pillar) and false for the transitional ego sub-module', () => {
    expect(isKnownPillarId('ai')).toBe(true);
    expect(isKnownPillarId('ego')).toBe(false);
  });

  it('returns false for unrelated strings', () => {
    expect(isKnownPillarId('')).toBe(false);
    expect(isKnownPillarId('shopping')).toBe(false);
    expect(isKnownPillarId('CORE')).toBe(false);
  });

  it('returns false for a hypothetical not-yet-curated pillar id', () => {
    // RD-9: a pillar the build has never heard of is NOT in the curated
    // PILLARS value, so the runtime seam still rejects it — even though it is
    // a valid `KnownPillarId` at the type level (see the type test below).
    expect(isKnownPillarId('weather')).toBe(false);
  });

  it('narrows the input to KnownPillarId when true', () => {
    const value: string = 'finance';
    if (isKnownPillarId(value)) {
      expectTypeOf(value).toEqualTypeOf<KnownPillarId>();
    }
  });
});

describe('KnownPillarId / ModuleId are open (RD-9)', () => {
  it('KnownPillarId resolves to string, not a closed literal union', () => {
    expectTypeOf<KnownPillarId>().toEqualTypeOf<string>();
    expectTypeOf<KnownPillarId>().toEqualTypeOf<PillarId>();
  });

  it('ModuleId resolves to string, not a closed literal union', () => {
    expectTypeOf<ModuleId>().toEqualTypeOf<string>();
  });

  it('a hypothetical new pillar / module id is assignable with NO type edit', () => {
    // The whole point of RD-9: adding `pillars/weather/` requires no edit to
    // the SDK type — its id is already a valid KnownPillarId / ModuleId. If
    // either of these stopped compiling, the union closed back up.
    const newPillar: KnownPillarId = 'weather';
    const newModule: ModuleId = 'weather-overlay';
    expect(newPillar).toBe('weather');
    expect(newModule).toBe('weather-overlay');
  });
});
