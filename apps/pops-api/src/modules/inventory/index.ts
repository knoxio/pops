/**
 * Inventory domain — home inventory items and location tree.
 */
import { router } from "../../trpc.js";
import { inventoryRouter as itemsRouter } from "./items/router.js";
import { locationsRouter } from "./locations/router.js";

export const inventoryRouter = router({
  items: itemsRouter,
  locations: locationsRouter,
});
