/**
 * Inventory domain — home inventory items, locations, connections, and photos.
 */
// Side-effect: register search adapters
import './items/search-adapter.js';

import { featuresRegistry } from '../core/features/index.js';
import { settingsRegistry } from '../core/settings/index.js';
import { inventoryFeaturesManifest } from './features.js';
import { inventoryManifest } from './settings-manifest.js';

settingsRegistry.register(inventoryManifest);
featuresRegistry.register(inventoryFeaturesManifest);

import { router } from '../../trpc.js';
import { connectionsRouter } from './connections/index.js';
import { documentFilesRouter } from './document-files/index.js';
import { documentsRouter } from './documents/index.js';
import { inventoryRouter as itemsRouter } from './items/router.js';
import { locationsRouter } from './locations/router.js';
import { paperlessRouter } from './paperless/router.js';
import { photosRouter } from './photos/index.js';
import { reportsRouter } from './reports/index.js';

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
