import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { mediaManifest } from '../manifest.js';

describe('media-contract /manifest — ModuleManifest export (PRD-241 US-01)', () => {
  it('mediaManifest passes assertModuleManifest with id=media', () => {
    expect(() => assertModuleManifest(mediaManifest, 'modules.media')).not.toThrow();
    expect(mediaManifest.id).toBe('media');
    expect(mediaManifest.name).toBe('Media');
    expect(mediaManifest.surfaces).toEqual(['app']);
  });

  it('mediaManifest contributes plex/arr/rotation/operational settings sections', () => {
    const sectionIds = (mediaManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['media.plex', 'media.arr', 'media.rotation', 'media.operational']);
  });
});
