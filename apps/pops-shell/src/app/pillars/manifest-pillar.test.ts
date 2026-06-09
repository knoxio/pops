/**
 * Tests for the shell-side module→pillar mapping (ADR-026 P3).
 */
import { describe, expect, it } from 'vitest';

import { CORE_PILLAR_ID, pillarIdForModule } from './manifest-pillar';

describe('pillarIdForModule', () => {
  it('returns the core pillar for every known module today', () => {
    // Every shell-installable module currently runs in core-api. The list is
    // pulled from `installed-modules.ts`'s known frontend manifests; if a
    // module migrates, this test failure is the prompt to update the mapping.
    const knownModules = [
      'ai',
      'cerebrum',
      'ego',
      'finance',
      'food',
      'inventory',
      'lists',
      'media',
    ];
    for (const id of knownModules) {
      expect(pillarIdForModule(id)).toBe(CORE_PILLAR_ID);
    }
  });

  it('returns the core pillar for unknown module ids (monolith fallback)', () => {
    expect(pillarIdForModule('some-future-module')).toBe('core');
  });

  it('exports CORE_PILLAR_ID as the literal "core"', () => {
    expect(CORE_PILLAR_ID).toBe('core');
  });
});
