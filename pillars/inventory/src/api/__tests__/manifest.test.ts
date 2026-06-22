/**
 * Manifest contract test — confirms the inventory pillar manifest
 * payload validates against `ManifestPayloadSchema` and surfaces the
 * `inventoryManifest` settings contribution introduced by PRD-240 US-03
 * plus the `nav` and `pages` UI dimensions introduced by PRD-243 US-02.
 */
import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { inventoryManifest } from '../../contract/settings/index.js';
import { buildInventoryCapabilityReporter, buildInventoryManifest } from '../manifest.js';

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
      package: '@pops/inventory',
      version: '4.5.6',
      tag: 'contract-inventory@v4.5.6',
    });
  });

  describe('PRD-243 US-02 — nav + pages UI dimensions', () => {
    it('declares the inventory nav descriptor with id, basePath, order, and items', () => {
      const payload = buildInventoryManifest('1.2.3');
      expect(payload.nav).toMatchObject({
        id: 'inventory',
        label: 'Inventory',
        labelKey: 'inventory',
        icon: 'package',
        color: 'amber',
        basePath: '/inventory',
        order: 30,
      });
      expect(payload.nav?.items.map((item) => item.path)).toEqual([
        '',
        '/warranties',
        '/locations',
        '/reports',
        '/connections',
      ]);
    });

    it('declares pages covering every inventory route surface', () => {
      const payload = buildInventoryManifest('1.2.3');
      expect(payload.pages).toEqual([
        { path: '', index: true, bundleSlot: 'inventory-items' },
        { path: 'items/new', bundleSlot: 'inventory-item-form' },
        { path: 'items/:id', bundleSlot: 'inventory-item-detail' },
        { path: 'items/:id/edit', bundleSlot: 'inventory-item-form' },
        { path: 'connections', bundleSlot: 'inventory-connections' },
        { path: 'warranties', bundleSlot: 'inventory-warranties' },
        { path: 'locations', bundleSlot: 'inventory-location-tree' },
        { path: 'reports', bundleSlot: 'inventory-report-dashboard' },
        { path: 'reports/insurance', bundleSlot: 'inventory-insurance-report' },
      ]);
    });

    it('omits assetsBaseUrl for the in-repo case', () => {
      const payload = buildInventoryManifest('1.2.3');
      expect(payload.assetsBaseUrl).toBeUndefined();
    });

    it('passes wire-shaped validation with the new UI dimensions populated', () => {
      const payload = buildInventoryManifest('1.2.3');
      const result = validateManifestPayload(payload);
      expect(result.ok).toBe(true);
    });
  });
});

describe('buildInventoryCapabilityReporter (P2 settings federation)', () => {
  it('reports settings: true so the shell routes settings to inventory', () => {
    expect(buildInventoryCapabilityReporter()()).toEqual({ settings: true });
  });
});
