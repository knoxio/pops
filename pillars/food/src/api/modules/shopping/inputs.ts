/**
 * Zod inputs for the `food.shopping.*` procedures (PRD-152).
 */
import { z } from 'zod';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const PreviewFromPlanInputSchema = z.object({
  startDate: IsoDate,
  endDate: IsoDate,
});

export type PreviewFromPlanInput = z.infer<typeof PreviewFromPlanInputSchema>;

export const GenerateFromPlanInputSchema = z.object({
  startDate: IsoDate,
  endDate: IsoDate,
  listName: z.string(),
});

export type GenerateFromPlanInput = z.infer<typeof GenerateFromPlanInputSchema>;

/** Inclusive on both ends; > 90 days is `BadDateRange`. */
export const MAX_RANGE_DAYS = 90;
