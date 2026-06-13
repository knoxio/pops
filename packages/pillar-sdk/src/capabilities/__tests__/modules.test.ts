import { describe, expect, expectTypeOf, it } from 'vitest';

import { PILLARS, type KnownPillarId } from '../known-pillar-id.js';
import {
  ALL_MODULE_IDS,
  MODULE_PARENT_PILLAR,
  isKnownPillarId,
  isModuleId,
  type ModuleId,
} from '../module-id.js';

describe('ALL_MODULE_IDS', () => {
  it('is a 9-element superset of PILLARS plus ai + ego', () => {
    expect(ALL_MODULE_IDS).toHaveLength(9);
    for (const pillar of PILLARS) {
      expect(ALL_MODULE_IDS).toContain(pillar);
    }
    expect(ALL_MODULE_IDS).toContain('ai');
    expect(ALL_MODULE_IDS).toContain('ego');
  });

  it('contains no duplicates', () => {
    const unique = new Set<string>(ALL_MODULE_IDS);
    expect(unique.size).toBe(ALL_MODULE_IDS.length);
  });

  it('typed as readonly tuple narrowing to ModuleId', () => {
    expectTypeOf<(typeof ALL_MODULE_IDS)[number]>().toEqualTypeOf<ModuleId>();
  });
});

describe('isKnownPillarId', () => {
  it('returns true for every entry in PILLARS', () => {
    for (const pillar of PILLARS) {
      expect(isKnownPillarId(pillar)).toBe(true);
    }
  });

  it('returns false for the transitional sub-module ids', () => {
    expect(isKnownPillarId('ai')).toBe(false);
    expect(isKnownPillarId('ego')).toBe(false);
  });

  it('returns false for unrelated strings', () => {
    expect(isKnownPillarId('')).toBe(false);
    expect(isKnownPillarId('shopping')).toBe(false);
    expect(isKnownPillarId('CORE')).toBe(false);
  });

  it('narrows the input to KnownPillarId when true', () => {
    const value: string = 'finance';
    if (isKnownPillarId(value)) {
      expectTypeOf(value).toEqualTypeOf<KnownPillarId>();
    }
  });
});

describe('isModuleId', () => {
  it('returns true for every pillar', () => {
    for (const pillar of PILLARS) {
      expect(isModuleId(pillar)).toBe(true);
    }
  });

  it('returns true for the transitional sub-module ids', () => {
    expect(isModuleId('ai')).toBe(true);
    expect(isModuleId('ego')).toBe(true);
  });

  it('returns false for unrelated strings', () => {
    expect(isModuleId('')).toBe(false);
    expect(isModuleId('shopping')).toBe(false);
    expect(isModuleId('Core')).toBe(false);
  });

  it('narrows the input to ModuleId when true', () => {
    const value: string = 'ai';
    if (isModuleId(value)) {
      expectTypeOf(value).toEqualTypeOf<ModuleId>();
    }
  });
});

describe('MODULE_PARENT_PILLAR', () => {
  it('maps every pillar to itself', () => {
    for (const pillar of PILLARS) {
      expect(MODULE_PARENT_PILLAR[pillar]).toBe(pillar);
    }
  });

  it('maps ai to core and ego to cerebrum per ADR-026', () => {
    expect(MODULE_PARENT_PILLAR.ai).toBe('core');
    expect(MODULE_PARENT_PILLAR.ego).toBe('cerebrum');
  });

  it('has an entry for every ModuleId', () => {
    for (const id of ALL_MODULE_IDS) {
      expect(MODULE_PARENT_PILLAR[id]).toBeDefined();
      expect(isKnownPillarId(MODULE_PARENT_PILLAR[id])).toBe(true);
    }
  });

  it('value type is exactly KnownPillarId', () => {
    expectTypeOf(MODULE_PARENT_PILLAR).toEqualTypeOf<Record<ModuleId, KnownPillarId>>();
  });
});
