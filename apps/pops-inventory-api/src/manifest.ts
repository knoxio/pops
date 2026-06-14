/**
 * Inventory pillar manifest payload builder.
 *
 * Hand-rolled until PRD-155 generates this from the contract. Declares
 * the inventory settings UI contribution under `settings.manifests`
 * (PRD-240 US-03) and, per PRD-243 US-02, the `nav` + `pages` UI
 * dimensions so the shell can mount the inventory app-rail entry and
 * routes from the registry walk. The `nav` and `pages` values mirror
 * `packages/app-inventory/src/routes.tsx` verbatim (icons translated to
 * the kebab-case wire form required by `NavConfigDescriptorSchema`).
 */
import { inventoryManifest } from '@pops/inventory-contract/settings';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

const INVENTORY_NAV: NavConfigDescriptor = {
  id: 'inventory',
  label: 'Inventory',
  labelKey: 'inventory',
  icon: 'package',
  color: 'amber',
  basePath: '/inventory',
  order: 30,
  items: [
    { path: '', label: 'Items', labelKey: 'inventory.items', icon: 'package' },
    {
      path: '/warranties',
      label: 'Warranties',
      labelKey: 'inventory.warranties',
      icon: 'shield-check',
    },
    { path: '/locations', label: 'Locations', labelKey: 'inventory.locations', icon: 'map-pin' },
    { path: '/reports', label: 'Reports', labelKey: 'inventory.reports', icon: 'bar-chart-3' },
    {
      path: '/connections',
      label: 'Connections',
      labelKey: 'inventory.connections',
      icon: 'network',
    },
  ],
};

const INVENTORY_PAGES: PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'inventory-items' },
  { path: 'items/new', bundleSlot: 'inventory-item-form' },
  { path: 'items/:id', bundleSlot: 'inventory-item-detail' },
  { path: 'items/:id/edit', bundleSlot: 'inventory-item-form' },
  { path: 'connections', bundleSlot: 'inventory-connections' },
  { path: 'warranties', bundleSlot: 'inventory-warranties' },
  { path: 'locations', bundleSlot: 'inventory-location-tree' },
  { path: 'reports', bundleSlot: 'inventory-report-dashboard' },
  { path: 'reports/insurance', bundleSlot: 'inventory-insurance-report' },
];

export function buildInventoryManifest(version: string): ManifestPayload {
  return {
    pillar: 'inventory',
    version,
    contract: {
      package: '@pops/inventory-contract',
      version,
      tag: `contract-inventory@v${version}`,
    },
    routes: {
      queries: [
        'inventory.locations.tree',
        'inventory.locations.list',
        'inventory.locations.get',
        'inventory.locations.getPath',
        'inventory.locations.children',
        'inventory.locations.deleteStats',
      ],
      mutations: [
        'inventory.locations.create',
        'inventory.locations.update',
        'inventory.locations.delete',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [inventoryManifest] },
    nav: INVENTORY_NAV,
    pages: INVENTORY_PAGES,
    healthcheck: { path: '/health' },
  };
}
