import type { SettingsManifest } from '@pops/types';

export const inventoryManifest: SettingsManifest = {
  id: 'inventory',
  title: 'Inventory',
  icon: 'Package',
  order: 400,
  groups: [
    {
      id: 'pagination',
      title: 'Pagination Defaults',
      description: 'Default page size for inventory list endpoints.',
      fields: [
        {
          key: 'inventory_items_default_limit',
          label: 'Items',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
        {
          key: 'inventory_connections_default_limit',
          label: 'Connections',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
        {
          key: 'inventory_photos_default_limit',
          label: 'Photos',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
        {
          key: 'inventory_documents_default_limit',
          label: 'Documents',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
        {
          key: 'inventory_document_files_default_limit',
          label: 'Document Files',
          type: 'number',
          default: '50',
          validation: { min: 1, max: 500 },
        },
      ],
    },
    {
      id: 'constraints',
      title: 'Constraints',
      fields: [
        {
          key: 'inventory_max_file_size_bytes',
          label: 'Max Upload Size (bytes)',
          type: 'number',
          default: '10485760',
          description: 'Maximum file size in bytes for document uploads (default 10 MiB).',
          validation: { min: 1024 },
        },
        {
          key: 'inventory_max_graph_depth',
          label: 'Max Graph Traversal Depth',
          type: 'number',
          default: '10',
          description: 'Maximum depth for connection graph/trace queries.',
          validation: { min: 1, max: 50 },
        },
      ],
    },
  ],
};
