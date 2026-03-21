/**
 * Inventory reports tRPC router — warranty tracking.
 */
import { router, protectedProcedure } from "../../../trpc.js";
import { toInventoryItem } from "../items/types.js";
import * as service from "./service.js";

export const reportsRouter = router({
  /** List all items with warranty dates, sorted by expiry. */
  warranties: protectedProcedure.query(() => {
    const rows = service.listWarrantyItems();
    return { data: rows.map(toInventoryItem) };
  }),
});
