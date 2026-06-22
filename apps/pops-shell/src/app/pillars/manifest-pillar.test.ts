/**
 * Tests for the shell-side module→pillar mapping (ADR-026 P3).
 */
import { describe, expect, it } from 'vitest';

import { pillarIdForModule, REGISTRY_PILLAR_ID } from './manifest-pillar';

describe('pillarIdForModule', () => {
  it('returns the platform registry pillar for every known module today', () => {
    // Unmigrated modules fall back to the platform `registry` pillar. The list
    // is pulled from `installed-modules.ts`'s known frontend manifests; if a
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
      expect(pillarIdForModule(id)).toBe(REGISTRY_PILLAR_ID);
    }
  });

  it('returns the platform registry pillar for unknown module ids (fallback)', () => {
    expect(pillarIdForModule('some-future-module')).toBe('registry');
  });

  it('exports REGISTRY_PILLAR_ID as the literal "registry"', () => {
    expect(REGISTRY_PILLAR_ID).toBe('registry');
  });
});
