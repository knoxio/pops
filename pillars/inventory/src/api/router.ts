/**
 * Root tRPC router for the inventory pillar container.
 *
 * Composes every inventory module — items, locations, connections,
 * fixtures, photos, reports, documents, document-files, paperless —
 * into the public `inventory.*` surface. Procedure paths mirror the
 * legacy pops-api router exactly so the dispatcher cutover is a
 * transparent URL swap rather than a procedure-path rename.
 */
import { connectionsRouter } from './modules/connections/index.js';
import { documentFilesRouter } from './modules/document-files/index.js';
import { documentsRouter } from './modules/documents/index.js';
import { fixturesRouter } from './modules/fixtures/index.js';
import { itemsRouter } from './modules/items/router.js';
import { locationsRouter } from './modules/locations/router.js';
import { paperlessRouter } from './modules/paperless/router.js';
import { photosRouter } from './modules/photos/index.js';
import { reportsRouter } from './modules/reports/index.js';
import { router } from './trpc.js';

export const inventoryRouter = router({
  items: itemsRouter,
  locations: locationsRouter,
  connections: connectionsRouter,
  fixtures: fixturesRouter,
  photos: photosRouter,
  reports: reportsRouter,
  documents: documentsRouter,
  documentFiles: documentFilesRouter,
  paperless: paperlessRouter,
});

export const appRouter = router({
  inventory: inventoryRouter,
});

export type AppRouter = typeof appRouter;
