import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { coreManifest } from '../manifest.js';

describe('core-contract /manifest — ModuleManifest exports (PRD-241 US-01)', () => {
  it('coreManifest passes assertModuleManifest with id=core', () => {
    expect(() => assertModuleManifest(coreManifest, 'modules.core')).not.toThrow();
    expect(coreManifest.id).toBe('core');
    expect(coreManifest.name).toBe('Core');
    expect(coreManifest.surfaces).toEqual(['app']);
  });

  // Core still carries the `ai.config` settings section during the
  // settings-federation S1 wire-compat window (PRD-055); the `ai` MODULE
  // manifest itself now lives in the extracted ai pillar.
  it('coreManifest contributes the core settings sections', () => {
    const sectionIds = (coreManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['ai.config', 'core.operational']);
  });
});
