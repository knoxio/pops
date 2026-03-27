/**
 * Inventory reports tRPC router — warranty tracking and insurance reports.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
    .input(
      z
        .object({
          locationId: z.string().optional(),
          includeChildren: z.boolean().optional(),
          sortBy: z.enum(["value", "name", "type"]).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      try {
        const result = service.getInsuranceReport({
          locationId: input?.locationId,
          includeChildren: input?.includeChildren ?? true,
          sortBy: input?.sortBy ?? "value",
        });
        return { data: result };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate insurance report",
          cause: err,
        });
      }
    }),

  /** Get replacement value breakdown grouped by location. */
  valueByLocation: protectedProcedure.query(() => {
    try {
      return { data: service.getValueByLocation() };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load value by location breakdown",
        cause: err,
      });
    }
  }),

  /** Get replacement value breakdown grouped by item type. */
  valueByType: protectedProcedure.query(() => {
    try {
      return { data: service.getValueByType() };
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load value by type breakdown",
        cause: err,
      });
    }
  }),
});
