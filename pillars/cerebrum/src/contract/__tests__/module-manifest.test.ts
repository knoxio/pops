import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { cerebrumManifest, egoManifest } from '../manifest.js';

describe('cerebrum-contract /manifest — ModuleManifest exports (PRD-241 US-01)', () => {
  it('cerebrumManifest passes assertModuleManifest with id=cerebrum', () => {
    expect(() => assertModuleManifest(cerebrumManifest, 'modules.cerebrum')).not.toThrow();
    expect(cerebrumManifest.id).toBe('cerebrum');
    expect(cerebrumManifest.name).toBe('Cerebrum');
    expect(cerebrumManifest.surfaces).toEqual(['app']);
  });

  it('cerebrumManifest contributes the cerebrum settings section', () => {
    const sectionIds = (cerebrumManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['cerebrum']);
  });

  it('egoManifest passes assertModuleManifest with id=ego and dual surfaces', () => {
    expect(() => assertModuleManifest(egoManifest, 'modules.ego')).not.toThrow();
    expect(egoManifest.id).toBe('ego');
    expect(egoManifest.name).toBe('Ego');
    expect(egoManifest.surfaces).toEqual(['app', 'overlay']);
  });

  it('egoManifest preserves the overlay chrome-slot + shortcut wiring', () => {
    expect(egoManifest.frontend?.overlay).toEqual({
      chromeSlot: 'assistant',
      shortcut: 'mod+i',
    });
  });

  it('egoManifest contributes the ego settings section', () => {
    const sectionIds = (egoManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['ego']);
  });
});
