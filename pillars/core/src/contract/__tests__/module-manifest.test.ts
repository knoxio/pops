import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { aiManifest, coreManifest } from '../manifest.js';

describe('core-contract /manifest — ModuleManifest exports (PRD-241 US-01)', () => {
  it('coreManifest passes assertModuleManifest with id=core', () => {
    expect(() => assertModuleManifest(coreManifest, 'modules.core')).not.toThrow();
    expect(coreManifest.id).toBe('core');
    expect(coreManifest.name).toBe('Core');
    expect(coreManifest.surfaces).toEqual(['app']);
  });

  it('coreManifest contributes the core settings sections', () => {
    const sectionIds = (coreManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['ai.config', 'core.operational']);
  });

  it('aiManifest passes assertModuleManifest with id=ai', () => {
    expect(() => assertModuleManifest(aiManifest, 'modules.ai')).not.toThrow();
    expect(aiManifest.id).toBe('ai');
    expect(aiManifest.name).toBe('AI Ops');
    expect(aiManifest.surfaces).toEqual(['app']);
    expect(aiManifest.settings).toBeUndefined();
  });
});
