/**
 * Input Zod schemas for `food.batches.*` procedures.
 *
 * Shapes match PRD-145 (CRUD lifecycle) + PRD-146 (`searchForConsume`).
 * Output types are inferred in the router via the cross-PRD contracts
 * exported from `@pops/app-food-db/types/batches.ts`.
 */

import { z } from 'zod';

const LOCATION = z.enum(['pantry', 'fridge', 'freezer', 'other']);
const UNIT = z.enum(['g', 'ml', 'count']);
const MANUAL_SOURCE_TYPE = z.enum(['purchase', 'gift', 'other']);
const ADJUST_REASON = z.enum(['spoiled', 'wasted', 'correction']);

/**
 * ISO 8601 datetime. PRD-145 services parse `producedAt` / `expiresAt`
 * as real timestamps (FIFO ordering, default-shelf-life arithmetic);
 * validating here means invalid values fail at the API boundary rather
 * than slipping into the DB. Same convention as
 * `apps/pops-api/src/modules/food/routers/ingest-schemas.ts`.
 */
const IsoDateTime = z.string().datetime();

export const CreateBatchInputSchema = z.object({
  variantId: z.number().int().positive(),
  prepStateId: z.number().int().positive().nullable(),
  qty: z.number().finite().nonnegative(),
  unit: UNIT,
  location: LOCATION,
  sourceType: MANUAL_SOURCE_TYPE,
  producedAt: IsoDateTime.optional(),
  expiresAt: IsoDateTime.optional(),
  notes: z.string().max(1000).optional(),
});

export const GetBatchInputSchema = z.object({
  id: z.number().int().positive(),
});

export const RelocateBatchInputSchema = z.object({
  id: z.number().int().positive(),
  location: LOCATION,
});

export const EditBatchInputSchema = z.object({
  id: z.number().int().positive(),
  expiresAt: IsoDateTime.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  prepStateId: z.number().int().positive().nullable().optional(),
});

export const AdjustBatchQtyInputSchema = z.object({
  id: z.number().int().positive(),
  delta: z.number().finite(),
  reason: ADJUST_REASON,
});

export const DeleteBatchInputSchema = z.object({
  id: z.number().int().positive(),
});

export const SearchForConsumeInputSchema = z.object({
  ingredientId: z.number().int().positive().optional(),
  variantId: z.number().int().positive().optional(),
  location: LOCATION.optional(),
  qtyGreaterThan: z.number().finite().nonnegative().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export type CreateBatchInput = z.infer<typeof CreateBatchInputSchema>;
export type GetBatchInput = z.infer<typeof GetBatchInputSchema>;
export type RelocateBatchInput = z.infer<typeof RelocateBatchInputSchema>;
export type EditBatchInput = z.infer<typeof EditBatchInputSchema>;
export type AdjustBatchQtyInput = z.infer<typeof AdjustBatchQtyInputSchema>;
export type DeleteBatchInput = z.infer<typeof DeleteBatchInputSchema>;
export type SearchForConsumeInput = z.infer<typeof SearchForConsumeInputSchema>;
