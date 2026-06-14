import { describe, expect, it } from 'vitest';

import { inventoryManifest } from '../settings/index.js';

describe('inventoryManifest', () => {
  it('still loads with id "inventory"', () => {
    expect(inventoryManifest.id).toBe('inventory');
  });
});
