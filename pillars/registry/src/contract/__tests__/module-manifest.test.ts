import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { coreManifest } from '../manifest.js';

describe('registry /manifest — ModuleManifest exports (PRD-241 US-01)', () => {
  it('coreManifest passes assertModuleManifest with id=registry', () => {
    expect(() => assertModuleManifest(coreManifest, 'modules.registry')).not.toThrow();
    expect(coreManifest.id).toBe('registry');
    expect(coreManifest.name).toBe('Registry');
    expect(coreManifest.surfaces).toEqual(['app']);
  });

  // The registry pillar still carries the `ai.config` settings section during
  // the settings-federation S1 wire-compat window (PRD-055); the `ai` MODULE
  // manifest itself now lives in the extracted ai pillar.
  it('coreManifest contributes the registry settings sections', () => {
    const sectionIds = (coreManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['ai.config', 'core.operational']);
  });
});
