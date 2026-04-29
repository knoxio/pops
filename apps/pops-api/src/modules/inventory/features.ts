import type { FeatureManifest } from '@pops/types';

/**
 * Inventory features (PRD-094).
 *
 * - `inventory.paperless` is gated on env-only credentials (Docker secrets in
 *   prod, dotenv in dev). When the env is missing the integration is unavailable.
 * - `inventory.show_connected_status` is the first user-scoped feature — each
 *   user can hide the linked-document badges on inventory items.
 */
export const inventoryFeaturesManifest: FeatureManifest = {
  id: 'inventory',
  title: 'Inventory',
  icon: 'Package',
  order: 300,
  features: [
    {
      key: 'inventory.paperless',
      label: 'Paperless integration',
      description:
        'Surface receipts and warranty docs from Paperless-ngx alongside inventory items.',
      default: true,
      scope: 'system',
      requiresEnv: ['PAPERLESS_BASE_URL', 'PAPERLESS_API_TOKEN'],
    },
    {
      key: 'inventory.show_connected_status',
      label: 'Show connected status',
      description:
        'Display the connected-status badge on inventory items linked to documents or photos.',
      default: true,
      scope: 'user',
    },
  ],
};
