import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { listsManifest } from '../manifest.js';

describe('lists-contract /manifest — ModuleManifest export (PRD-241 US-01)', () => {
  it('listsManifest passes assertModuleManifest with id=lists', () => {
    expect(() => assertModuleManifest(listsManifest, 'modules.lists')).not.toThrow();
    expect(listsManifest.id).toBe('lists');
    expect(listsManifest.name).toBe('Lists');
    expect(listsManifest.surfaces).toEqual(['app']);
  });

  it('listsManifest declares no settings dimension', () => {
    expect(listsManifest.settings).toBeUndefined();
  });
});
