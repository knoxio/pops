/**
 * Manifest contract test — confirms the inventory pillar manifest
 * payload validates against `ManifestPayloadSchema` and surfaces the
 * `inventoryManifest` settings contribution introduced by PRD-240 US-03.
 */
import { describe, expect, it } from 'vitest';

import { inventoryManifest } from '@pops/inventory-contract/settings';
import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';

import { buildInventoryManifest } from '../manifest.js';

describe('buildInventoryManifest', () => {
  it('produces a payload that validates against ManifestPayloadSchema', () => {
    const payload = buildInventoryManifest('1.2.3');
    const result = ManifestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('declares the inventory settings manifest under settings.manifests', () => {
    const payload = buildInventoryManifest('1.2.3');
    expect(payload.settings).toEqual({ manifests: [inventoryManifest] });
  });

  it('threads the version through the contract block', () => {
    const payload = buildInventoryManifest('4.5.6');
    expect(payload.contract).toEqual({
      package: '@pops/inventory-contract',
      version: '4.5.6',
      tag: 'contract-inventory@v4.5.6',
    });
  });
});
