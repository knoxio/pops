import { describe, expect, it } from 'vitest';

import { assertModuleManifest } from '@pops/types';

import { inventoryManifest } from '../manifest.js';

describe('inventory-contract /manifest — ModuleManifest export (PRD-241 US-01)', () => {
  it('inventoryManifest passes assertModuleManifest with id=inventory', () => {
    expect(() => assertModuleManifest(inventoryManifest, 'modules.inventory')).not.toThrow();
    expect(inventoryManifest.id).toBe('inventory');
    expect(inventoryManifest.name).toBe('Inventory');
    expect(inventoryManifest.surfaces).toEqual(['app']);
  });

  it('inventoryManifest contributes the inventory settings section', () => {
    const sectionIds = (inventoryManifest.settings ?? []).map((s) => s.id);
    expect(sectionIds).toEqual(['inventory']);
  });
});
