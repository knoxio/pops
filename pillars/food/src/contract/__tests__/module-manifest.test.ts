import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { foodManifest } from '../manifest.js';

describe('food /manifest — ModuleManifest export', () => {
  it('foodManifest passes assertModuleManifest with id=food', () => {
    expect(() => assertModuleManifest(foodManifest, 'modules.food')).not.toThrow();
    expect(foodManifest.id).toBe('food');
    expect(foodManifest.name).toBe('Food');
    expect(foodManifest.surfaces).toEqual(['app']);
  });

  it('foodManifest declares no settings dimension', () => {
    expect(foodManifest.settings).toBeUndefined();
  });
});
