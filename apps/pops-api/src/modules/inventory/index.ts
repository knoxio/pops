/**
 * Inventory domain — home inventory items, locations, and connections.
 */
import { router } from "../../trpc.js";
import { inventoryRouter as itemsRouter } from "./items/router.js";
import { locationsRouter } from "./locations/router.js";
import { connectionsRouter } from "./connections/index.js";

export const inventoryRouter = router({
  items: itemsRouter,
  locations: locationsRouter,
  connections: connectionsRouter,
});
