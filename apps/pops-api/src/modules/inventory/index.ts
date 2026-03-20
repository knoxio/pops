/**
 * Inventory domain — home inventory items.
 */
import { router } from "../../trpc.js";
import { inventoryRouter as itemsRouter } from "./items/router.js";

export const inventoryRouter = router({
  items: itemsRouter,
});
