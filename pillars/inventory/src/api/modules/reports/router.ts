/**
 * Inventory reports tRPC router — warranty tracking and insurance reports.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpError } from '../../shared/errors.js';
import { protectedProcedure, router } from '../../trpc.js';
import { toInventoryItem } from '../items/types.js';
import * as service from './service.js';

function reportError(messageKey: string, detail: string, originalCause: unknown): TRPCError {
  const carrier = new HttpError(500, `Report error: ${detail}`, undefined, messageKey);
  if (originalCause !== undefined) carrier.cause = originalCause;
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Report error: ${detail}`,
    cause: carrier,
  });
}

export const reportsRouter = router({
  /** Get dashboard summary (item count, total values, warranty alerts, recent items). */
  dashboard: protectedProcedure.query(({ ctx }) => {
    return { data: service.getDashboard(ctx.inventoryDb) };
  }),

  /** List all items with warranty dates, sorted by expiry. */
  warranties: protectedProcedure.query(({ ctx }) => {
    const rows = service.listWarrantyItems(ctx.inventoryDb);
    return {
      data: rows.map((row) => ({
        ...toInventoryItem(row),
        warrantyDocumentId: row.warrantyDocumentId,
      })),
    };
  }),

  /** Insurance report: items grouped by location with photo thumbnails and totals. */
  insuranceReport: protectedProcedure
    .input(
      z
        .object({
          locationId: z.string().optional(),
          includeChildren: z.boolean().optional(),
          sortBy: z.enum(['value', 'name', 'type']).optional(),
        })
        .optional()
    )
    .query(({ input, ctx }) => {
      try {
        const result = service.getInsuranceReport(ctx.inventoryDb, {
          locationId: input?.locationId,
          includeChildren: input?.includeChildren ?? true,
          sortBy: input?.sortBy ?? 'value',
        });
        return { data: result };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[insurance-report] Failed:', detail, err);
        throw reportError('inventory.reports.insuranceReportFailed', detail, err);
      }
    }),

  /** Get replacement value breakdown grouped by location. */
  valueByLocation: protectedProcedure.query(({ ctx }) => {
    try {
      return { data: service.getValueByLocation(ctx.inventoryDb) };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[value-by-location] Failed:', detail, err);
      throw reportError('inventory.reports.valueByLocationFailed', detail, err);
    }
  }),

  /** Get replacement value breakdown grouped by item type. */
  valueByType: protectedProcedure.query(({ ctx }) => {
    try {
      return { data: service.getValueByType(ctx.inventoryDb) };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[value-by-type] Failed:', detail, err);
      throw reportError('inventory.reports.valueByTypeFailed', detail, err);
    }
  }),
});
