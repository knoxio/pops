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

  // The registry pillar no longer carries the `ai.config` settings section:
  // the extracted `ai` pillar (PRD-055) owns and advertises `ai.config`, and
  // the registry's settings surface is its own `core.operational` only.
  it('coreManifest contributes only the registry-owned settings section', () => {
    const sectionIds = (coreManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['core.operational']);
  });
});
