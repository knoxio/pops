/**
 * Zod contract schemas for the shelf_impressions router.
 *
 * The shapes mirror the `shelfImpressionsService` surface in
 * `@pops/media-db` (the slice cut over for Track F). The duplication is
 * intentional during the additive Phase 5 PR 1 window so the legacy
 * pops-api `assembleSession` procedure can keep serving traffic while
 * media-api stands up its own per-slice surface.
 */
import { z } from 'zod';

export const ShelfIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9:_\-./]+$/, 'shelfId must match /^[A-Za-z0-9:_\\-./]+$/');

export const RecordImpressionsInputSchema = z.object({
  shelfIds: z.array(ShelfIdSchema).min(1).max(50),
});

export type RecordImpressionsInput = z.infer<typeof RecordImpressionsInputSchema>;

export const RecordImpressionsResultSchema = z.object({
  ok: z.literal(true),
  recorded: z.number().int().nonnegative(),
});

export type RecordImpressionsResult = z.infer<typeof RecordImpressionsResultSchema>;

export const GetRecentImpressionsInputSchema = z.object({
  days: z.number().int().positive().max(90).default(7),
});

export type GetRecentImpressionsInput = z.infer<typeof GetRecentImpressionsInputSchema>;

export const RecentImpressionEntrySchema = z.object({
  shelfId: z.string(),
  impressionCount: z.number().int().nonnegative(),
});

export const GetRecentImpressionsResultSchema = z.object({
  windowDays: z.number().int().positive(),
  entries: z.array(RecentImpressionEntrySchema),
});

export type GetRecentImpressionsResult = z.infer<typeof GetRecentImpressionsResultSchema>;

export const GetShelfFreshnessInputSchema = z.object({
  shelfId: ShelfIdSchema,
  days: z.number().int().positive().max(90).default(7),
});

export const GetShelfFreshnessResultSchema = z.object({
  shelfId: z.string(),
  impressionCount: z.number().int().nonnegative(),
  freshness: z.number().min(0).max(1),
});

export type GetShelfFreshnessResult = z.infer<typeof GetShelfFreshnessResultSchema>;

export const CleanupResultSchema = z.object({
  ok: z.literal(true),
});

export type CleanupResult = z.infer<typeof CleanupResultSchema>;
