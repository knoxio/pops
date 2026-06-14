/**
 * Inventory pillar manifest payload builder.
 *
 * Hand-rolled until PRD-155 generates this from the contract. Declares
 * the inventory settings UI contribution under `settings.manifests` per
 * PRD-240 US-03.
 */
import { inventoryManifest } from '@pops/inventory-contract/settings';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

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
    healthcheck: { path: '/health' },
  };
}
