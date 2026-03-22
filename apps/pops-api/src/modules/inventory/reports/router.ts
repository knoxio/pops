/**
 * Inventory reports tRPC router — warranty tracking and insurance reports.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../../trpc.js";
import { toInventoryItem } from "../items/types.js";
import * as service from "./service.js";

export const reportsRouter = router({
  /** Get dashboard summary (item count, total values, warranty alerts, recent items). */
  dashboard: protectedProcedure.query(() => {
    return { data: service.getDashboard() };
  }),

  /** List all items with warranty dates, sorted by expiry. */
  warranties: protectedProcedure.query(() => {
    const rows = service.listWarrantyItems();
    return { data: rows.map(toInventoryItem) };
  }),

  /** Insurance report: items grouped by location with photo thumbnails and totals. */
  insuranceReport: protectedProcedure
    .input(z.object({ locationId: z.string().optional() }).optional())
    .query(({ input }) => {
      const result = service.getInsuranceReport(input?.locationId);
      return { data: result };
    }),

  /** Get replacement value breakdown grouped by location. */
  valueByLocation: protectedProcedure.query(() => {
    return { data: service.getValueByLocation() };
  }),

  /** Get replacement value breakdown grouped by item type. */
  valueByType: protectedProcedure.query(() => {
    return { data: service.getValueByType() };
  }),
});
