/**
 * Input Zod schemas for the fridge endpoints
 * (`pillars/food/docs/prds/fridge-view`).
 *
 * `RecipesUsingBatchInputSchema` powers the "Cook now" picker on a batch row.
 */

import { z } from 'zod';

const LOCATION = z.enum(['pantry', 'fridge', 'freezer', 'other']);

export const FridgeViewInputSchema = z.object({
  search: z.string().trim().max(120).optional(),
  locations: z.array(LOCATION).min(1).max(4).optional(),
  expiringSoon: z.boolean().optional(),
  recipeYieldedOnly: z.boolean().optional(),
  includeEmpty: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
});

export const RecipesUsingBatchInputSchema = z.object({
  batchId: z.number().int().positive(),
  limit: z.number().int().positive().max(100).optional(),
});

export type FridgeViewInput = z.infer<typeof FridgeViewInputSchema>;
export type RecipesUsingBatchInput = z.infer<typeof RecipesUsingBatchInputSchema>;
