/**
 * ts-rest handler composer for the inventory pillar.
 *
 * Stitches the per-module handler factories into the typed
 * `RouterImplementation<InventoryRestContract>` that
 * `createExpressEndpoints` consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { inventoryContract } from '../../contract/rest.js';
import { type OpenedInventoryDb } from '../../db/index.js';
import { makeConnectionsHandlers } from './connections-handlers.js';
import { makeDocumentFilesHandlers } from './document-files-handlers.js';
import { makeDocumentsHandlers } from './documents-handlers.js';
import { makeFixturesHandlers } from './fixtures-handlers.js';
import { makeItemsHandlers } from './items-handlers.js';
import { makeLocationsHandlers } from './locations-handlers.js';
import { makePaperlessHandlers } from './paperless-handlers.js';
import { makePhotosHandlers } from './photos-handlers.js';
import { makeReportsHandlers } from './reports-handlers.js';
import { makeSearchHandlers } from './search-handlers.js';
import { makeSettingsHandlers } from './settings-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeInventoryRestHandlers(deps: {
  inventoryDb: OpenedInventoryDb;
}): ReturnType<typeof server.router<typeof inventoryContract>> {
  const db = deps.inventoryDb.db;
  return server.router(inventoryContract, {
    items: makeItemsHandlers(db),
    locations: makeLocationsHandlers(db),
    connections: makeConnectionsHandlers(db),
    fixtures: makeFixturesHandlers(db),
    photos: makePhotosHandlers(db),
    documents: makeDocumentsHandlers(db),
    documentFiles: makeDocumentFilesHandlers(db),
    reports: makeReportsHandlers(db),
    paperless: makePaperlessHandlers(),
    search: makeSearchHandlers(db),
    settings: makeSettingsHandlers(db),
  });
}
