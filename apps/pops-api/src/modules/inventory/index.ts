/**
 * Inventory domain — home inventory items, locations, connections, photos, documents, and reports.
 */
import { router } from "../../trpc.js";
import { inventoryRouter as itemsRouter } from "./items/router.js";
import { locationsRouter } from "./locations/router.js";
import { connectionsRouter } from "./connections/index.js";
import { photosRouter } from "./photos/index.js";
import { documentsRouter } from "./documents/index.js";
import { reportsRouter } from "./reports/router.js";

export const inventoryRouter = router({
  items: itemsRouter,
  locations: locationsRouter,
  connections: connectionsRouter,
  photos: photosRouter,
  documents: documentsRouter,
  reports: reportsRouter,
});
