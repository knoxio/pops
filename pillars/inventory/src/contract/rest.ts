/**
 * REST contract for the inventory pillar — ts-rest single source of truth.
 *
 * Composes the nine module sub-routers (items, locations, connections,
 * fixtures, photos, documents, documentFiles, reports, paperless) into
 * the public wire surface. `generateOpenApi(inventoryContract, …)`
 * projects this to `openapi/inventory.openapi.json`; `openapi-typescript`
 * then projects the JSON to `src/contract/api-types.generated.ts`.
 *
 * Lego principle: this is the ONLY description of the inventory wire
 * format. Don't hand-author OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { inventoryConnectionsContract } from './rest-connections.js';
import { inventoryDocumentFilesContract } from './rest-document-files.js';
import { inventoryDocumentsContract } from './rest-documents.js';
import { inventoryFixturesContract } from './rest-fixtures.js';
import { inventoryItemsContract } from './rest-items.js';
import { inventoryLocationsContract } from './rest-locations.js';
import { inventoryPaperlessContract } from './rest-paperless.js';
import { inventoryPhotosContract } from './rest-photos.js';
import { inventoryReportsContract } from './rest-reports.js';
import { inventorySearchContract } from './rest-search.js';

const c = initContract();

export const inventoryContract = c.router(
  {
    items: inventoryItemsContract,
    locations: inventoryLocationsContract,
    connections: inventoryConnectionsContract,
    fixtures: inventoryFixturesContract,
    photos: inventoryPhotosContract,
    documents: inventoryDocumentsContract,
    documentFiles: inventoryDocumentFilesContract,
    reports: inventoryReportsContract,
    paperless: inventoryPaperlessContract,
    search: inventorySearchContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type InventoryRestContract = typeof inventoryContract;
