import { inventoryManifest } from '@pops/module-registry/settings';

/**
 * Inventory domain — home inventory items, locations, connections, and photos.
 */
import { router } from '../../trpc.js';
import { connectionsRouter } from './connections/index.js';
import { documentFilesRouter } from './document-files/index.js';
import { documentsRouter } from './documents/index.js';
import { inventoryFeaturesManifest } from './features.js';
import { inventoryRouter as itemsRouter } from './items/router.js';
import { inventoryItemsSearchAdapter } from './items/search-adapter.js';
import { locationsRouter } from './locations/router.js';
import { inventoryMigrations } from './migrations.js';
import { paperlessRouter } from './paperless/router.js';
import { photosRouter } from './photos/index.js';
import { reportsRouter } from './reports/index.js';
import { inventoryUriHandler } from './uri-handler.js';

import type { ModuleManifest } from '@pops/types';

export const inventoryRouter = router({
  items: itemsRouter,
  locations: locationsRouter,
  connections: connectionsRouter,
  photos: photosRouter,
  reports: reportsRouter,
  documents: documentsRouter,
  documentFiles: documentFilesRouter,
  paperless: paperlessRouter,
});

/** PRD-098 manifest. Metadata-only; consumed by the PRD-100 loader. */
export const manifest: ModuleManifest<typeof inventoryRouter> = {
  id: 'inventory',
  name: 'Inventory',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Home items, locations, connections, warranties, and documents.',
  backend: { router: inventoryRouter, migrations: inventoryMigrations },
  settings: [inventoryManifest],
  features: [inventoryFeaturesManifest],
  search: [inventoryItemsSearchAdapter],
  uriHandler: inventoryUriHandler,
};
