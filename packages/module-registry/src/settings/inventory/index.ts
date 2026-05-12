/**
 * Inventory settings manifest — pagination, file limits, and search defaults.
 */
import type { SettingsManifest } from '@pops/types';

export const inventoryManifest: SettingsManifest = {
  id: 'inventory',
  title: 'Inventory',
  icon: 'Package',
  order: 150,
  groups: [
    {
      id: 'inventoryPagination',
      title: 'Pagination',
      description: 'Default page sizes for inventory list endpoints.',
      fields: [
        {
          key: 'inventory.defaultLimit',
          label: 'Default Page Size',
          type: 'number',
          default: '50',
          description: 'Default page size for items, connections, documents, and photos.',
          validation: { min: 1, max: 200 },
        },
        {
          key: 'inventory.searchDefaultLimit',
          label: 'Search Default Limit',
          type: 'number',
          default: '20',
          description: 'Default result limit for inventory search.',
          validation: { min: 1, max: 100 },
        },
      ],
    },
    {
      id: 'documentFiles',
      title: 'Document Files',
      description: 'Upload constraints for inventory document attachments.',
      fields: [
        {
          key: 'inventory.maxFileSizeBytes',
          label: 'Max File Size (bytes)',
          type: 'number',
          default: '10485760',
          description: 'Maximum upload file size in bytes (default 10 MB).',
          validation: { min: 1048576 },
        },
      ],
    },
  ],
};
